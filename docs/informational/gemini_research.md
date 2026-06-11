Dar el salto de un hub contable pasivo (que solo recibe y audita) a un **emisor activo de facturación electrónica** es el movimiento estratégico correcto para Fintral. Al quitar la dependencia de terceros, te conviertes en el sistema operativo financiero del cliente.

Integrar con **Alanube** es una excelente decisión arquitectónica: ellos se encargan de la parte más compleja y burocrática (la firma criptográfica con el certificado digital `.p12` del cliente, el resguardo en HSM, el empaquetado en XML y la comunicación directa con los servidores SOAP/REST de la DGII).

Tu trabajo en Fintral es construir una **lógica de dominio robusta, multi-tenant y tolerante a fallos** que alimente a Alanube y reaccione a sus respuestas. A continuación, te presento la investigación profunda y el diseño lógico-técnico para estructurar este módulo.

---

## 1. Arquitectura del Dominio (Multi-Tenant SaaS)

Para que Fintral soporte múltiples empresas (tenants) facturando en paralelo, cada una con múltiples sucursales y cajas, debes estructurar tus entidades bajo patrones de **Domain-Driven Design (DDD)**.

### Entidades y Agregados Clave

* **Tenant (Empresa Emisora):** Contiene el RNC, Razón Social, Certificado Digital (ID de integración en Alanube) y configuración fiscal global.
* **Branch (Sucursal) & POS (Punto de Venta/Caja):** La DGII exige identificar desde qué punto físico o virtual se emite el e-CF. Cada caja puede tener rangos de secuencias independientes para evitar colisiones.
* **VoucherRange (Rango de Comprobantes):** El objeto que controla la vida útil de las secuencias autorizadas por la DGII.
* **Invoice (e-CF Aggregate Root):** El documento fiscal en sí. Es inmutable una vez que la DGII lo acepta. Sus sub-entidades son `InvoiceLine` (Detalle) e `InvoiceTax` (Desglose de impuestos).

---

## 2. Gestión Lógica de Rangos de Comprobantes (Voucher Ranges)

Este es el corazón preventivo de tu sistema. Si falla el control de secuencias, romperás la correlatividad fiscal del cliente, lo cual conlleva multas por parte de la DGII.

### Estructura de Datos en Base de Datos

Cada rango configurado manualmente por el usuario desde la OFV debe guardarse con este modelo lógico:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `id` | UUID | Identificador único del rango. |
| `tenant_id` | UUID | Relación con la empresa. |
| `tipo_ecf` | Integer | Código DGII (31, 32, 34, etc.). |
| `serie` | String | Siempre `E` para comprobantes electrónicos. |
| `desde` | Long / Int | Número inicial autorizado (ej: `1`). |
| `hasta` | Long / Int | Número final autorizado (ej: `5000`). |
| `actual` | Long / Int | El último número **utilizado con éxito**. |
| `fecha_vencimiento` | Date | Límite legal para usar el rango. |
| `status` | Enum | `ACTIVE`, `EXHAUSTED`, `EXPIRED`. |

### El Reto de la Concurrencia (Evitar Duplicados)

Si dos cajeros del mismo cliente dan clic a "Facturar" exactamente al mismo milisegundo, tu backend no puede usar un simple `SELECT actual FROM ranges` seguido de un `UPDATE`, porque ambos leerán el mismo número y generarán un e-NCF duplicado.

* **Solución en base de datos transaccional (PostgreSQL):** Utiliza bloqueos pesimistas en la transacción de asignación:
```sql

```



SELECT actual FROM voucher_ranges WHERE id = :id FOR UPDATE;

```
*   **Solución con Redis (Súper recomendado para tu stack con Upstash):** Puedes manejar el contador de la secuencia actual como una clave atómica en Redis: `tenant:{id}:ecf:31:counter`. Al facturar, ejecutas un comando `INCR` que garantiza la atomicidad matemática en nanosegundos sin bloquear tablas enteras.

---

## 3. Máquina de Estados de la Factura (Invoice State Machine)

Una factura electrónica no pasa de "no existir" a "estar aprobada" de inmediato. El procesamiento con la DGII a través de Alanube es **asíncrono** en escenarios de alta carga. Tu entidad `Invoice` debe gobernarse por una máquina de estados estricta:


```

[Borrador] ──► [Por Enviar] ──► [Enviado a Alanube] ──► [Aceptado DGII]
│
├──► [Rechazado DGII]
│
└──► [Aceptado Condicionado]

```

### Definición Técnica de Estados

1.  **Borrador (Draft):** El usuario está armando la factura. Aún no se consume secuencia ni se calcula hash fiscal. Es editable.
2.  **Por Enviar (Pending_Send):** Se presiona "Facturar". El sistema **reserva la secuencia de forma atómica**, calcula los totales fijos e inhabilita cualquier edición.
3.  **Enviado a Alanube (Processing / Sent):** El payload JSON se envió a la API de Alanube. Alanube responde inmediatamente con un `job_id` o `track_id`. Esto significa que el documento entró en cola de procesamiento.
4.  **Aceptado por DGII (Accepted):** El Web Service de la DGII validó el XML, la firma y el rango, retornando un estatus exitoso. Fintral guarda el *Impuesto Liquidado* y el documento queda blindado legalmente.
5.  **Aceptado Condicionado (Accepted_With_Conditions):** La DGII acepta el documento pero detecta advertencias menores (ej: el RNC del comprador tiene una actividad económica sospechosa o datos informativos desactualizados). Pasa como válido, pero se guarda la advertencia en bitácora.
6.  **Rechazado por DGII (Rejected):** Error crítico de negocio (ej: secuencia vencida, error de cálculo en el ITBIS, RNC del emisor suspendido). **La secuencia utilizada se pierde legalmente; no se puede reutilizar.** El cliente debe corregir el problema y emitir una nueva factura con la siguiente secuencia libre.

---

## 4. Estrategia de Integración con Alanube API

Alanube funciona como una capa de abstracción REST. En lugar de lidiar con XMLs firmados mediante código nativo tuyo, Fintral le envía un JSON limpio con la estructura comercial del documento.

### Flujo de Comunicación Síncrono vs Asíncrono

La API de Alanube te permite enviar la factura y esperar la respuesta en tiempo real (síncrono), o enviarla y recibir un webhook cuando la DGII responda (asíncrono). Para una plataforma SaaS como Fintral, el diseño híbrido es el más eficiente:

1.  **Envío en background:** Tu backend toma la factura en estado `Pending_Send`, genera el JSON estructurado según los parámetros de Alanube y hace el `POST`.
2.  **Manejo del Webhook (Crucial):** Debes exponer un endpoint público en Fintral (`/api/v1/webhooks/alanube`). Alanube disparará un evento hacia ti tan pronto como la DGII procese el documento. 
3.  **Idempotencia:** Asegúrate de validar el `track_id` o el ID de la factura que te envía Alanube en el webhook para evitar procesar dos veces la misma notificación en caso de reintentos de red.

> 📝 **Valor Agregado para Fintral (Auditoría en tiempo real):** Al tener tu propio facturador modularizado y conectado vía webhooks, en el mismo instante en que la DGII aprueba una factura de venta de tu cliente, la lógica de dominio de Fintral puede actualizar los dashboards de salud financiera, proyecciones de flujo de caja y estimaciones de pago de ITBIS (Formulario IT-1) del mes en curso, ofreciendo una automatización contable total.

<ElicitationsGroup message="¿Por dónde prefieres que continuemos estructurando este módulo?">
  
  <Elicitation label="Diseñar el esquema de base de datos PostgreSQL para las tablas de facturación" query="Muéstrame un diseño de esquema SQL optimizado para las tablas de Invoices, InvoiceLines y VoucherRanges preparado para multi-tenant."/>
  <Elicitation label="Ver la estructura del JSON que espera Alanube para un e-CF de Crédito Fiscal (31)" query="Cuál es la estructura estándar del payload JSON que se le envía a Alanube para emitir una Factura de Crédito Fiscal Electrónica (Tipo 31)?"/>
</ElicitationsGroup>

```