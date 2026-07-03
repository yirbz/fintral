# Paddle Billing — Descubrimiento y Definición de Alcance

## Objetivo

Migrar el sistema de suscripciones de Fintral hacia Paddle Billing como gestor de suscripciones y pasarela de pago para tarjetas, manteniendo un flujo híbrido para transferencias bancarias que se ajuste a la realidad del mercado dominicano (Banreservas, Popular, BHD).

**Meta final:** Que Paddle sea la fuente de verdad técnica para el estado de suscripciones (vía webhooks), el checkout de tarjetas sea automático, y las transferencias bancarias sigan gestionándose desde el panel admin pero activen la suscripción en Paddle al ser validadas.

---

## Dominio / Stack

- **Producto:** Fintral — Accounting HUB + facturación digital (República Dominicana)
- **Backend:** Python 3.11, FastAPI, SQLAlchemy
- **Frontend:** Next.js 15, React 19, shadcn/ui, Tailwind CSS 3
- **DB:** PostgreSQL (Supabase)
- **Pasarela actual:** MIO (Geopagos) para tarjetas
- **Transferencias actuales:** Comprobante vía `PaymentProof` + verificación admin
- **Pricing actual:** RD$ (DOP) — Inicial RD$ 999, Profesional RD$ 2,999, Despacho RD$ 7,999

---

## Investigación Realizada

### Fuentes consultadas

| Herramienta | Uso |
|---|---|
| **Context7 MCP** (`context7_query-docs`) | Documentación oficial de Paddle Billing: Python SDK, Paddle.js (TypeScript wrapper), Next.js Starter Kit |
| **Context7 MCP** (`context7_resolve-library-id`) | Resolución de IDs de librerías: `/paddlehq/paddle-python-sdk`, `/paddlehq/paddle-js-wrapper`, `/paddlehq/paddle-nextjs-starter-kit` |
| **CodeGraph MCP** (`codegraph_context`) | Análisis del estado actual del sistema: modelos (`SubscriptionPlan`, `OrganizationSubscription`, `PaymentProof`), routers (`plans.py`, `admin.py`, `mio.py`), servicios (`plan_service.py`, `mio_service.py`) |

### SDKs y wrappers analizados

- **Paddle Billing Python SDK** (`/paddlehq/paddle-python-sdk`) — 115 snippets, 76.2 benchmark. Cliente oficial para backend Python.
- **Paddle.js** (`/paddlehq/paddle-js-wrapper`) — 613 snippets, 79.29 benchmark. Wrapper TypeScript para checkout y eventos en frontend.
- **Paddle Next.js Starter Kit** (`/paddlehq/paddle-nextjs-starter-kit`) — 89 snippets. Patrón de referencia: webhooks → Supabase, pricing page, customer portal.

### Links de documentación

- https://github.com/paddlehq/paddle-python-sdk
- https://github.com/paddlehq/paddle-js-wrapper
- https://github.com/paddlehq/paddle-nextjs-starter-kit
- https://developer.paddle.com (referencia cruzada)

### Aspectos clave investigados

| Tópico | Hallazgo |
|---|---|
| Inicialización sandbox | `Client(api_key, options=Options(Environment.SANDBOX))` |
| Paddle.js checkout | `initializePaddle({ seller, environment, eventCallback })` |
| Webhooks | Verificación HMAC-SHA256 vía `Notifications.Secret` + `Verifier` |
| Eventos críticos | `subscription.created/activated/updated/canceled`, `transaction.completed/past_due` |
| Simulaciones | `paddle.simulations.create()` + `paddle.simulation_runs.create()` para testear webhooks sin transacciones reales |
| Customer Portal | `paddle.customer_portal_sessions.create()` para autogestión |
| CollectionMode | `Automatic` (card/digital wallet) vs `Manual` (offline/transferencias) |
| Creación de suscripciones | Solamente posible vía Paddle Checkout o Paddle API (no hay auto-activación sin pago) |
| Pricing previews | `paddle.pricing_previews.preview_prices()` con tax, currency, address |
| Cliente MIO (Geopagos) actual | Pasarela actual para tarjetas, tokens OAuth2, creación de órdenes, webhooks |
| PaymentProof actual | Modelo existente para transferencias: subida de comprobante → admin verifica → activación manual |

### Restricción crítica descubierta

**Paddle NO soporta DOP (Peso Dominicano)** como moneda de transacción. Soporta ~25 monedas (USD, EUR, BRL, MXN, etc.) pero no DOP. Esto implica:

- Los precios en Paddle deben estar en USD
- Los clientes que pagan con tarjeta ven el monto en USD
- Las transferencias bancarias deben seguir en DOP (el cliente paga en Banreservas/Popular/BHD en RD$)
- Para no romper la UX local, el pricing visible en el panel debe seguir en DOP

---

## Scope Decidido: Opción C — Híbrido con Panel Admin (Scope 3)

### Decisión

**Pago mezclado centralizado en el panel admin.**

| Flujo | Mecanismo | Moneda |
|---|---|---|
| **Tarjeta** | Paddle Checkout (Paddle.js) → Paddle procesa → webhook `subscription.activated` → plan activado automáticamente | USD |
| **Transferencia bancaria** | Usuario sube comprobante en panel → admin verifica → backend crea suscripción en Paddle API → Paddle dispara webhook `subscription.created` → plan activado | DOP |

### Por qué esta opción

1. **Realidad del mercado RD:** ~70-80% de los clientes PYMES y contadores pagan por transferencia bancaria. Forzarlos a un checkout en USD o a una pasarela internacional añade fricción y reduce conversión.

2. **UX clara y honesta:** "Si pagas con tarjeta es automático. Si pagas con transferencia, debes esperar a que validemos el comprobante. Está bajo tu responsabilidad con qué pagas."

3. **Banreservas, Popular y BHD no existen en Paddle.** No hay forma de ofrecer "Paga desde tu Banco Popular" dentro del checkout de Paddle. En el panel admin podemos mostrar las cuentas exactas de cada banco.

4. **DOP se mantiene como moneda de presentación** para transferencias. El cliente ve RD$ 2,999, transfiere RD$ 2,999, no hay confusión con tipo de cambio.

5. **Gradual y bajo riesgo:** Las tarjetas migran primero a Paddle (reemplazando MIO). Las transferencias migran después: admin verifica → Paddle API crea suscripción → webhook activa. Sin cortes bruscos.

6. **Paddle como fuente de verdad técnica:** Los webhooks mantienen `OrganizationSubscription.status` sincronizado para ambos flujos. Reporting financiero desde Paddle para tarjetas + capa local para transferencias.

### Lo que NO se hará (descartado)

- ❌ Scope 1 (solo tarjeta): Deja las transferencias completamente fuera de Paddle, no aprovecha la gestión de suscripciones.
- ❌ Scope 2 (todo en Paddle): UX rompida para el mercado RD, cliente PYME se encuentra con precios en USD y checkout internacional.

---

## Próximos Pasos (Implementación)

1. Setup sandbox Paddle + variables de entorno
2. Endpoint `POST /api/paddle/webhook` con verificación HMAC
3. Migrar checkout de tarjetas de MIO → Paddle.js
4. Integrar webhooks `subscription.created/activated/updated/canceled` con `OrganizationSubscription`
5. Modificar `PATCH /api/admin/payment-proofs/{id}` (verificación) para crear suscripción en Paddle API
6. CRON de reconciliación diaria Paddle ↔ DB
7. Deprecar MIO
8. Customer Portal de Paddle para autogestión (cambio de tarjeta, cancelación)
