"""MioWebhookHandler — processes MIO payment gateway webhook events."""

from __future__ import annotations

import json
import logging

from typing import Any, Dict
from sqlalchemy.orm import Session

from app.models.billing_webhook_event import BillingWebhookEvent
from app.services.lago_service import LagoService
from app.services.plan_service import ADDON_SPECS, DISCOUNT_TIERS
from app.services.payment_intent_service import PaymentIntentService, PaymentIntentError
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)


class MioWebhookHandler:
    """Processes MIO webhook events idempotently with state-machine enforcement."""

    def __init__(self, db: Session):
        self.db = db
        self.lago = LagoService()

    async def process(self, event_type: str, event_id: str, payload: Dict[str, Any]) -> BillingWebhookEvent:
        """Persist and process a MIO webhook event idempotently."""
        existing = (
            self.db.query(BillingWebhookEvent)
            .filter(BillingWebhookEvent.event_id == event_id)
            .first()
        )
        if existing:
            logger.info(f"MIO Webhook {event_id} already processed, skipping")
            return existing

        event = BillingWebhookEvent(
            event_id=event_id,
            event_type=event_type,
            source="mio",
            payload=payload,
        )
        self.db.add(event)
        self.db.flush()

        try:
            if event_type == "TRANSACTION_COMPLETED":
                order_uuid = self._extract_order_uuid(payload)
                payment_data = self._extract_payment_data(payload)
                amount_cents = (
                    payload.get("amount_cents")
                    or payload.get("data", {}).get("attributes", {}).get("amount_cents")
                )
                intent_svc = PaymentIntentService(self.db)
                intent_svc.process_webhook_event(
                    event_type=event_type,
                    order_uuid=order_uuid,
                    new_status="SUCCESS",
                    amount_cents=amount_cents,
                    payment_data=payment_data,
                    raw_payload=payload,
                )
                await self._handle_transaction_completed(order_uuid, payment_data)
            elif event_type in ("TRANSACTION_FAILED", "PAYMENT_FAILED"):
                order_uuid = self._extract_order_uuid(payload)
                amount_cents = (
                    payload.get("amount_cents")
                    or payload.get("data", {}).get("attributes", {}).get("amount_cents")
                )
                intent_svc = PaymentIntentService(self.db)
                intent_svc.process_webhook_event(
                    event_type=event_type,
                    order_uuid=order_uuid,
                    new_status="FAILED",
                    amount_cents=amount_cents,
                    raw_payload=payload,
                )
            elif event_type in ("CHECKOUT_EXPIRED", "ORDER_EXPIRED"):
                order_uuid = self._extract_order_uuid(payload)
                intent_svc = PaymentIntentService(self.db)
                intent_svc.process_webhook_event(
                    event_type=event_type,
                    order_uuid=order_uuid,
                    new_status="EXPIRED",
                    raw_payload=payload,
                )
            elif event_type in ("TRANSACTION_CANCELLED", "PAYMENT_CANCELLED"):
                order_uuid = self._extract_order_uuid(payload)
                intent_svc = PaymentIntentService(self.db)
                intent_svc.process_webhook_event(
                    event_type=event_type,
                    order_uuid=order_uuid,
                    new_status="EXPIRED",
                    raw_payload=payload,
                )
            else:
                logger.info(f"Unhandled MIO webhook event type: {event_type}")

            event.processed = True
            event.processed_at = utc_now()
            self.db.commit()
            logger.info(f"Successfully processed MIO webhook {event_id}")
        except PaymentIntentError as e:
            self.db.rollback()
            event.error = str(e)
            event.attempts += 1
            self.db.commit()
            logger.warning(f"Payment intent error processing MIO webhook {event_id}: {e}")
            raise e  # propagate so the router can return 400
        except Exception as e:
            self.db.rollback()
            event.error = str(e)
            event.attempts += 1
            self.db.commit()
            logger.exception(f"Failed to process MIO webhook {event_id}")
            raise e

        return event

    def _extract_order_uuid(self, payload: Dict[str, Any]) -> str:
        order_uuid = (
            payload.get("order_uuid")
            or payload.get("data", {}).get("attributes", {}).get("uuid")
            or payload.get("uuid")
        )
        if not order_uuid:
            raise PaymentIntentError("No order UUID found in MIO webhook payload")
        return order_uuid

    def _extract_payment_data(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return (
            payload.get("payment", {})
            or payload.get("data", {}).get("attributes", {}).get("payment", {})
        )

    async def _handle_transaction_completed(self, order_uuid: str, payment_data: Dict[str, Any]) -> None:
        """Post-SUCCESS provisioning: cart, statement, Lago, email."""
        from app.models.mio_payment_order import MioPaymentOrder

        order = self.db.query(MioPaymentOrder).filter(MioPaymentOrder.order_uuid == order_uuid).first()
        if not order:
            raise ValueError(f"Order not found: {order_uuid}")

        logger.info(f"MIO Order {order_uuid} successfully paid. Recording payment in Lago...")

        # Provision cart items if present on the order
        if order.cart_items_json:
            try:
                cart_items = order.cart_items_json
                if isinstance(cart_items, str):
                    cart_items = json.loads(cart_items)

                if cart_items and isinstance(cart_items, list):
                    from app.services.billing_checkout_service import BillingCheckoutService
                    checkout_svc = BillingCheckoutService(self.db)
                    await checkout_svc.provision_completed_cart(
                        org_id=str(order.organization_id) if order.organization_id else str(order.user_id),
                        user_id=str(order.user_id) if order.user_id else "",
                        items=cart_items,
                    )
                    logger.info(f"Provisioned {len(cart_items)} cart items from MIO order {order_uuid}")

                    plan_change_item = next((i for i in cart_items if isinstance(i, dict) and i.get("type") in ("plan_change", "renewal")), None)
                    if plan_change_item and order.user_id:
                        plan_name = plan_change_item.get("plan_name")
                        if plan_name:
                            await checkout_svc.provision_user_subscription(
                                user_id=str(order.user_id),
                                plan_name=plan_name,
                                payment_method="card"
                            )
                            logger.info(f"Provisioned mixed-cart user subscription for user {order.user_id} to plan {plan_name}")

                    statement_item = next((i for i in cart_items if isinstance(i, dict) and i.get("type") == "statement_payment"), None)
                    if statement_item:
                        cycle = statement_item.get("cycle")
                        org_id = statement_item.get("organization_id")
                        order_months = max(1, statement_item.get("months", 1))
                        if cycle and org_id:
                            from app.models.monthly_charge import MonthlyCharge
                            from app.models.organization_subscription import OrganizationSubscription
                            from app.models.subscription_plan import SubscriptionPlan
                            from datetime import timedelta
                            charges = (
                                self.db.query(MonthlyCharge)
                                .filter(
                                    MonthlyCharge.organization_id == org_id,
                                    MonthlyCharge.cycle == cycle,
                                    MonthlyCharge.paid == False,  # noqa: E712
                                )
                                .all()
                            )
                            now = utc_now()
                            for c in charges:
                                c.paid = True
                                c.paid_at = now
                            logger.info(f"Marked {len(charges)} statement charges as paid via MIO order {order_uuid} for org {org_id} cycle {cycle}")

                            sub = (
                                self.db.query(OrganizationSubscription)
                                .filter(
                                    OrganizationSubscription.organization_id == org_id,
                                    OrganizationSubscription.status.in_(["active", "trialing"]),
                                )
                                .first()
                            )
                            if sub and sub.billing_cycle_end and now > sub.billing_cycle_end:
                                sub.billing_cycle_end = sub.billing_cycle_end + timedelta(days=30 * order_months)
                                if sub.pending_plan_change_id:
                                    pending_plan = (
                                        self.db.query(SubscriptionPlan)
                                        .filter(SubscriptionPlan.id == sub.pending_plan_change_id)
                                        .first()
                                    )
                                    if pending_plan:
                                        sub.plan_id = pending_plan.id
                                        plan = pending_plan
                                    sub.pending_plan_change_id = None
                                else:
                                    plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.id == sub.plan_id).first()
                                if plan:
                                    from app.models.user_subscription import UserSubscription
                                    user_sub = None
                                    if order.user_id:
                                        user_sub = (
                                            self.db.query(UserSubscription)
                                            .filter(UserSubscription.user_id == str(order.user_id))
                                            .order_by(UserSubscription.created_at.desc())
                                            .first()
                                        )
                                    new_cycle = int(now.strftime("%Y%m"))
                                    discount = DISCOUNT_TIERS.get(order_months, 0.0)
                                    discounted_monthly = plan.price_monthly_cents * (1 - discount)
                                    self.db.add(MonthlyCharge(
                                        organization_id=org_id,
                                        cycle=new_cycle,
                                        charge_type="plan",
                                        quantity=order_months,
                                        unit_price_cents=int(discounted_monthly),
                                        total_price_cents=int(discounted_monthly * order_months),
                                        label=f"Plan {plan.display_name}{' × ' + str(order_months) + ' meses' if order_months > 1 else ''}",
                                        paid=True,
                                        paid_at=now,
                                    ))
                                    for atype, count_field, pending_field, price_field, alabel in ADDON_SPECS:
                                        if atype == "entity_slot" and user_sub:
                                            count = getattr(user_sub, count_field, 0) or 0
                                            pending = getattr(user_sub, pending_field, 0) or 0
                                        else:
                                            count = getattr(sub, count_field, 0) or 0
                                            pending = getattr(sub, pending_field, 0) or 0
                                        price_cents = getattr(plan, price_field, 0) or 0
                                        net = max(count - pending, 0)
                                        if net > 0 and price_cents:
                                            discounted_unit = int(price_cents * (1 - discount))
                                            self.db.add(MonthlyCharge(
                                                organization_id=org_id,
                                                cycle=new_cycle,
                                                charge_type=atype,
                                                quantity=net * order_months,
                                                unit_price_cents=discounted_unit,
                                                total_price_cents=discounted_unit * net * order_months,
                                                label=f"{net} {alabel}{' × ' + str(order_months) + ' meses' if order_months > 1 else ''}",
                                                paid=True,
                                                paid_at=now,
                                            ))
                            self.db.commit()
            except Exception as e:
                logger.error(f"Failed to provision cart items from MIO order {order_uuid}: {e}")

        # Provision user subscription if it's a user subscription payment order
        if order.user_id and order.plan_id:
            try:
                from app.services.billing_checkout_service import BillingCheckoutService
                from app.models.subscription_plan import SubscriptionPlan

                plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.id == order.plan_id).first()
                if plan:
                    checkout_svc = BillingCheckoutService(self.db)
                    await checkout_svc.provision_user_subscription(
                        user_id=str(order.user_id),
                        plan_name=plan.name,
                        payment_method="card"
                    )
                    logger.info(f"Provisioned subscription for user {order.user_id} to plan {plan.name}")
            except Exception as e:
                logger.error(f"Failed to provision user subscription after MIO payment: {e}")

        # Record payment in Lago
        if order.lago_invoice_id:
            try:
                paid_at = utc_now().strftime("%Y-%m-%d")
                await self.lago.record_payment(
                    invoice_id=order.lago_invoice_id,
                    amount_cents=order.amount_cents,
                    reference=order.reference_number or order.payment_id or order_uuid,
                    paid_at=paid_at
                )
                logger.info(f"Recorded payment for Lago invoice {order.lago_invoice_id} successfully.")
            except Exception as e:
                logger.error(f"Failed to record payment in Lago for invoice {order.lago_invoice_id}: {e}")
        else:
            logger.info(f"No lago_invoice_id associated with MIO order {order_uuid}")

        # Send provisional invoice/receipt email
        try:
            from app.services.email_service import send_purchase_invoice_email
            from app.models.user import User
            from app.models.organization import Organization

            email_sent = False
            amount_dop = float(order.amount_cents) / 100.0
            fee_amount = amount_dop * 0.05 / 1.05
            subtotal_dop = amount_dop - fee_amount

            if order.user_id:
                user = self.db.query(User).filter(User.id == order.user_id).first()
                if user:
                    from app.models.subscription_plan import SubscriptionPlan
                    plan = self.db.query(SubscriptionPlan).filter(SubscriptionPlan.id == order.plan_id).first()
                    plan_name = plan.display_name if plan and plan.display_name else (plan.name if plan else "Suscripción")
                    items_list = [{
                        "label": f"Fintral Hub: Suscripción Plan {plan_name}",
                        "quantity": 1,
                        "total": subtotal_dop
                    }]
                    email_sent = send_purchase_invoice_email(
                        customer_email=user.email,
                        customer_name=user.full_name or user.email,
                        items=items_list,
                        total=amount_dop,
                        currency="DOP",
                        payment_method="card",
                        fee_amount=fee_amount
                    )
            elif order.organization_id:
                org = self.db.query(Organization).filter(Organization.id == order.organization_id).first()
                if org:
                    ecf_labels = {
                        525.0: "Fintral Factura: Bloque prepagado de 100 e-CFs",
                        2100.0: "Fintral Factura: Bloque prepagado de 500 e-CFs",
                        3675.0: "Fintral Factura: Bloque prepagado de 1000 e-CFs",
                    }
                    label = ecf_labels.get(amount_dop, "Fintral Factura: Compra de bloques e-CF")

                    if order.cart_items_json:
                        items_desc = []
                        for ci in (order.cart_items_json if isinstance(order.cart_items_json, list) else []):
                            if isinstance(ci, dict):
                                ct = ci.get("type", "")
                                qty = ci.get("quantity", 1)
                                if ct == "ecf_blocks":
                                    target = ci.get("target_org_id", "")
                                    items_desc.append(f"{qty}x Bloque e-CF" + (f" (org {target[:8]}...)" if target else ""))
                                elif ct == "entity_slot":
                                    items_desc.append(f"{qty}x Slot Empresa")
                                elif ct == "user_slot":
                                    target = ci.get("target_org_id", "")
                                    items_desc.append(f"{qty}x Slot Usuario" + (f" (org {target[:8]}...)" if target else ""))
                                elif ct == "plan_change":
                                    items_desc.append(f"Plan {ci.get('plan_name', '')}")
                        if items_desc:
                            label = "Fintral: " + ", ".join(items_desc)

                        items_list = [{
                            "label": label,
                            "quantity": 1,
                            "total": subtotal_dop,
                        }]
                    else:
                        items_list = [{
                            "label": label,
                            "quantity": 1,
                            "total": subtotal_dop
                        }]
                    email_sent = send_purchase_invoice_email(
                        customer_email=org.email_contact or "administracion@fintral.com",
                        customer_name=org.name,
                        items=items_list,
                        total=amount_dop,
                        currency="DOP",
                        payment_method="card",
                        fee_amount=fee_amount
                    )

            if email_sent:
                logger.info(f"Provisional invoice email sent successfully for MIO order {order_uuid}")
            else:
                logger.warning(f"Could not send provisional invoice email for MIO order {order_uuid}")
        except Exception as e:
            logger.error(f"Error sending provisional invoice email for MIO order {order_uuid}: {e}")

        self.db.flush()

