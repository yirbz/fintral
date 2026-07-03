"use client";

import React from "react";
import { PlanSummary, AddonsSummary } from "@/lib/api/plans";
import { AddonCard, AddonItem } from "./addon-card";
import { ConfirmAddonDialog } from "./confirm-addon-dialog";

interface AddonSectionProps {
  plan: PlanSummary | null;
  addons: AddonsSummary | undefined;
  cartItems: any[];
  onAddPrepayToCart: (type: string, quantity: number, pricePerBlockDop: number, label: string) => void;
  onAddPostpayToCart: (type: string, label: string, priceCents: number) => void;
}

export function AddonSection({
  plan,
  addons,
  cartItems,
  onAddPrepayToCart,
  onAddPostpayToCart,
}: AddonSectionProps) {
  const ecfBlockPriceDop = (plan?.addon_ecf_block_price ?? 950.00) * 100;
  const aiBlockPriceDop = (plan?.addon_ai_block_price ?? 600.00) * 100;
  const storageBlockPriceDop = (plan?.addon_storage_block_price ?? 300.00) * 100;
  const ocrBlockPriceDop = (plan?.addon_ocr_block_price ?? 500.00) * 100;
  const entitySlotPriceDop = (plan?.entity_slot_price ?? 600.00) * 100;
  const userSlotPriceDop = (plan?.user_slot_price ?? 300.00) * 100;

  const prepayList: AddonItem[] = [
    {
      type: "ecf_blocks",
      label: "Bloque 100 ECF",
      description: "100 documentos electrónicos adicionales para tus entidades.",
      priceDopCents: ecfBlockPriceDop,
      isPrepay: true,
    },
  ];

  const postpayList: AddonItem[] = [
    {
      type: "ai",
      label: "Bloques de IA",
      description: `Consultas de IA adicionales. ${addons?.ai_block_size || 500} consultas por bloque.`,
      priceDopCents: aiBlockPriceDop,
      isPrepay: false,
      currentCount: addons?.ai_blocks || 0,
      disabled: !plan,
    },
    {
      type: "storage",
      label: "Almacenamiento",
      description: `Almacenamiento adicional. ${(addons?.storage_block_mb || 10240) / 1024} GB por bloque.`,
      priceDopCents: storageBlockPriceDop,
      isPrepay: false,
      currentCount: addons?.storage_blocks || 0,
      disabled: !plan,
    },
    {
      type: "ocr",
      label: "Documentos OCR",
      description: `Documentos OCR adicionales. ${plan?.addon_ocr_block_size || 100} docs por bloque.`,
      priceDopCents: ocrBlockPriceDop,
      isPrepay: false,
      currentCount: addons?.ocr_blocks || 0,
      disabled: !plan,
    },
    {
      type: "entity_slot",
      label: "Slot de Empresa",
      description: "Invita una empresa o entidad adicional a tu cuenta Fintral.",
      priceDopCents: entitySlotPriceDop,
      isPrepay: false,
      currentCount: plan ? (plan as any).addon_entity_slots || 0 : 0,
      disabled: !plan,
    },
    {
      type: "user_slot",
      label: "Slot de Usuario",
      description: "Permite que un usuario colaborador adicional acceda a tu cuenta.",
      priceDopCents: userSlotPriceDop,
      isPrepay: false,
      currentCount: plan ? (plan as any).addon_user_slots || 0 : 0,
      disabled: !plan,
    },
  ];

  const handlePrepayAction = (item: AddonItem) => {
    if (item.disabled) return;
    onAddPrepayToCart(item.type, 1, item.priceDopCents / 100, item.label);
  };

  const handlePostpayAction = (item: AddonItem) => {
    if (item.disabled) return;
    onAddPostpayToCart(item.type, item.label, item.priceDopCents);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-medium text-brand-ink dark:text-white">
          Complementos disponibles
        </h3>
        <p className="text-xs text-brand-ink-mute dark:text-slate-400">
          Añade capacidad de facturas, consultas de IA, almacenamiento o usuarios colaboradores a tu plan.
        </p>
      </div>

      {/* Prepaid blocks (e-CF) */}
      <h4 className="text-sm font-medium text-brand-ink dark:text-white">Prepago</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        {prepayList.map((addon) => {
          const inCart = cartItems.some((i) => i.type === addon.type);
          return (
            <AddonCard
              key={addon.type}
              addon={addon}
              onAction={() => handlePrepayAction(addon)}
              isLoading={false}
              inCart={inCart}
            />
          );
        })}
      </div>

      {/* Post-pay addons (superpuestos-al-plan, prorated) */}
      <h4 className="text-sm font-medium text-brand-ink dark:text-white">Superpuesto al plan</h4>
      <p className="text-xs text-brand-ink-mute dark:text-slate-400 -mt-3">
        Se cobran de forma proporcional a los días restantes de tu ciclo y se añaden a tu estado de cuenta mensual.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        {postpayList.map((addon) => {
          const inCart = cartItems.some((i) => i.type === addon.type);
          return (
            <AddonCard
              key={addon.type}
              addon={addon}
              onAction={() => handlePostpayAction(addon)}
              isLoading={false}
              inCart={inCart}
            />
          );
        })}
      </div>
    </div>
  );
}
