# Formatos de Reporte 606 y 607: Modelo de Datos por Campo
## Documento de Referencia para Sistemas LLM — DGII República Dominicana

---

## 1. VISIÓN GENERAL: ¿QUÉ SON EL 606 Y EL 607?

Los formatos 606 y 607 son **reportes mensuales de operaciones** que los contribuyentes deben enviar a la DGII a más tardar el día **15 de cada mes**, conforme a la Norma General 07-2018.

| Formato | Nombre oficial | Qué reporta |
|---|---|---|
| **606** | Formato de Envío de Compras de Bienes y Servicios | Todas las **compras** del período: proveedores, NCF recibidos, ITBIS pagado, retenciones |
| **607** | Formato de Envío de Ventas de Bienes y Servicios | Todas las **ventas** del período: clientes, NCF emitidos, ITBIS cobrado, retenciones recibidas |
| **608** | Formato de Envío de Comprobantes Anulados | NCF anulados en el período |

> Si no hubo operaciones en el período, igual se deben enviar los tres formatos **de manera informativa** (en cero), seleccionando "Declaraciones en Cero" en la Oficina Virtual.

---

## 2. ENCABEZADO DE AMBOS FORMATOS (606 y 607)

El encabezado es idéntico en estructura para ambos formatos. Es la identificación del contribuyente que remite.

| Campo | Tipo | Formato | Descripción |
|---|---|---|---|
| `rnc_cedula` | string | 9 u 11 dígitos | RNC o cédula del contribuyente que remite la información |
| `periodo` | string | `AAAAMM` | Período fiscal reportado (ej: `202501` = enero 2025) |
| `cantidad_registros` | integer | Máx 10,000 (606) / 65,000 (607) | Cantidad de comprobantes en el detalle |

> **Diferencia de límites:** El 606 acepta hasta 10,000 registros; el 607 acepta hasta 65,000 registros por período.

---

## 3. DETALLE DEL FORMATO 606 — COMPRAS

Cada fila del 606 representa **un comprobante recibido** (una compra o gasto).

### 3.1 Campos del 606 — Descripción completa

#### **Columna 1: RNC o Cédula (del proveedor)**
- Tipo: string
- Descripción: Identificación del proveedor/suplidor del que se compró.
- Validación DGII: El RNC debe estar activo. Si está inactivo → alerta. Si es cédula de persona física registrada como contribuyente → alerta de que debe emitir NCF válido.

#### **Columna 2: Tipo Identificación (del proveedor)**
- Tipo: enum integer
- Valores posibles:
  - `1` = RNC (persona jurídica o física con RNC)
  - `2` = Cédula
- Regla: Debe ser coherente con el número registrado en Columna 1.

#### **Columna 3: Tipo de Bienes y Servicios Comprados**
- Tipo: enum integer (1–11)
- Descripción: Categorización del gasto para fines de ISR.
- Valores:

| Código | Descripción |
|---|---|
| `1` | Gastos de personal |
| `2` | Gastos por trabajos, suministros y servicios |
| `3` | Arrendamientos |
| `4` | Gastos de activos fijos |
| `5` | Gastos de representación |
| `6` | Otras deducciones admitidas |
| `7` | Gastos financieros |
| `8` | Gastos extraordinarios |
| `9` | Compras y gastos que formarán parte del costo de venta |
| `10` | Adquisiciones de activos |
| `11` | Gastos de seguros |

> Este campo es clave para la **declaración de ISR**. La suma por categoría se traslada a los anexos del IR-2.

#### **Columna 4: NCF**
- Tipo: string (11, 13 o 19 caracteres)
- Descripción: Número completo del comprobante fiscal recibido.
- Incluye: facturas regulares, notas de débito/crédito, comprobantes de compras, gastos menores.
- NCF históricos (pre-mayo 2018): acepta 19 posiciones.

#### **Columna 5: NCF o Documento Modificado**
- Tipo: string | null
- Descripción: Solo aplica cuando el NCF de la Col. 4 es una Nota de Débito (B03/E33) o Nota de Crédito (B04/E34). Debe contener el NCF original que está siendo modificado.
- Si el NCF original fue emitido antes de mayo 2018: acepta estructura de 19 posiciones.

#### **Columna 6: Fecha Comprobante**
- Tipo: date
- Formato: `AAAAMMDD`
- Descripción: Fecha en que fue emitido el comprobante por el proveedor.
- ⚠️ Regla de segunda remisión: Si se reporta un NCF por segunda vez (para incluir la retención), la fecha del comprobante debe ser la **misma que en el primer reporte**.

#### **Columna 7: Fecha Pago**
- Tipo: date | null
- Formato: `AAAAMMDD`
- Descripción: Fecha en que se pagó el comprobante.
- Cuándo es obligatoria: Si se aplica retención de ITBIS o ISR, este campo es **obligatorio**. De lo contrario puede dejarse en blanco.
- ⚠️ Regla crítica: Las columnas 12 (ITBIS Retenido), 17 (Tipo Retención ISR) y 18 (Monto Retención Renta) siempre requieren que Col. 7 esté llena.

#### **Columna 8: Monto Facturado en Servicios**
- Tipo: decimal
- Descripción: Porción del monto del NCF que corresponde a **servicios**, sin incluir impuestos.

#### **Columna 9: Monto Facturado en Bienes**
- Tipo: decimal
- Descripción: Porción del monto del NCF que corresponde a **bienes**, sin incluir impuestos.

#### **Columna 10: Total Monto Facturado** *(calculado automáticamente)*
- Tipo: decimal
- Descripción: Suma de Col. 8 + Col. 9. Se calcula automáticamente al validar.

#### **Columna 11: ITBIS Facturado**
- Tipo: decimal
- Descripción: Monto total de ITBIS generado en el comprobante (lo que el proveedor cobró de ITBIS).

#### **Columna 12: ITBIS Retenido**
- Tipo: decimal | null
- Descripción: ITBIS que el comprador **retuvo** al proveedor (en casos donde el comprador actúa como agente de retención de ITBIS).
- Requiere: Col. 7 (Fecha Pago) completa.
- ⚠️ No confundir con ITBIS Facturado. El ITBIS retenido es una parte del ITBIS facturado que el comprador no pagó al proveedor sino que lo retiene para entregarlo directamente a la DGII.

#### **Columna 13: ITBIS sujeto a Proporcionalidad (Art. 349)**
- Tipo: decimal | null
- Descripción: Porción del ITBIS que estará sujeta al cálculo de proporcionalidad según el Art. 349 de la Ley 11-92.
- Uso: Para contribuyentes que realizan tanto actividades gravadas como exentas, y deben prorratear el ITBIS deducible.
- La sumatoria de esta columna alimenta el **Anexo A del formulario de ITBIS**.

#### **Columna 14: ITBIS llevado al Costo**
- Tipo: decimal | null
- Descripción: ITBIS que NO se deduce como adelanto en la declaración de ITBIS, sino que se registra como costo en la declaración de ISR.
- ⚠️ No incluir aquí el ITBIS no admitido por proporcionalidad (eso va en Col. 13).

#### **Columna 15: ITBIS por Adelantar** *(calculado automáticamente)*
- Tipo: decimal
- Fórmula: `Col. 11 (ITBIS Facturado) - Col. 14 (ITBIS llevado al Costo)`
- Descripción: Es el ITBIS que el contribuyente puede adelantar/deducir en su declaración de ITBIS.

#### **Columna 16: ITBIS Percibido en Compras** *(campo reservado)*
- Tipo: decimal | null
- Descripción: ITBIS percibido por terceros al momento de la facturación.
- Estado actual: **No habilitado** hasta que exista normativa de régimen de percepción.

#### **Columna 17: Tipo de Retención en ISR**
- Tipo: enum integer | null (1–9)
- Descripción: Código del tipo de retención de ISR aplicada.
- Requiere: Col. 7 (Fecha Pago) completa.
- Valores:

| Código | Descripción |
|---|---|
| `1` | Alquileres |
| `2` | Honorarios por servicios |
| `3` | Otras rentas |
| `4` | Otras rentas (rentas presuntas) |
| `5` | Intereses pagados a personas jurídicas residentes |
| `6` | Intereses pagados a personas físicas residentes |
| `7` | Retención por proveedores del Estado |
| `8` | Juegos telefónicos |
| `9` | Retenciones subsector de ganadería de carne bovina |

#### **Columna 18: Monto Retención Renta**
- Tipo: decimal | null
- Descripción: Monto de ISR retenido al proveedor.
- Cálculo: `Monto Servicios (Col. 8) × porcentaje de retención según tipo`
- Requiere: Col. 7 (Fecha Pago) completa.

#### **Columna 19: ISR Percibido en Compras** *(campo reservado)*
- Tipo: decimal | null
- Estado actual: **No habilitado** hasta que exista normativa de percepción.

#### **Columna 20: Impuesto Selectivo al Consumo**
- Tipo: decimal | null
- Descripción: ISC correspondiente a compras gravadas con este impuesto (alcohol, tabaco, combustibles, etc.)

#### **Columna 21: Otros Impuestos/Tasas**
- Tipo: decimal | null
- Descripción: Cualquier otro impuesto o tasa que forme parte del valor del comprobante y no esté en los campos anteriores.

#### **Columna 22: Monto Propina Legal**
- Tipo: decimal | null
- Descripción: Propina del 10% establecida por Ley 54-32. Aplica principalmente a servicios de restauración.

#### **Columna 23: Forma de Pago**
- Tipo: enum integer (1–7)
- Descripción: Método de pago usado para saldar el comprobante.

| Código | Descripción |
|---|---|
| `1` | Efectivo |
| `2` | Cheques / Transferencias / Depósito |
| `3` | Tarjeta crédito/débito |
| `4` | Compra a crédito |
| `5` | Permuta |
| `6` | Notas de crédito |
| `7` | Mixto |

---

## 4. DETALLE DEL FORMATO 607 — VENTAS

Cada fila del 607 representa **un comprobante emitido** (una venta o ingreso).

### 4.1 Campos del 607 — Descripción completa

#### **Columna 1: RNC / Cédula o Pasaporte (del cliente)**
- Tipo: string
- Descripción: Identificación del comprador/cliente al que se le vendió.
- Para facturas de consumo (B02/E32) con monto ≥ RD$250,000: obligatorio.

#### **Columna 2: Tipo Identificación (del cliente)**
- Tipo: enum integer (1–3)
- Valores:
  - `1` = RNC
  - `2` = Cédula
  - `3` = Pasaporte o ID tributaria extranjera

#### **Columna 3: Número Comprobante Fiscal**
- Tipo: string (11 o 13 caracteres)
- Descripción: NCF o e-NCF emitido. Es el comprobante de la venta.

#### **Columna 4: Número Comprobante Fiscal Modificado**
- Tipo: string | null
- Descripción: NCF original afectado por una Nota de Débito (B03/E33) o Nota de Crédito (B04/E34).
- Solo aplica cuando el comprobante de la Col. 3 es una nota de ajuste.

#### **Columna 5: Tipo de Ingreso**
- Tipo: enum integer (1–6)
- Descripción: Clasificación del tipo de ingreso para el ISR.

| Código | Descripción |
|---|---|
| `1` | Ingresos por operaciones (No financieros) — el más común |
| `2` | Ingresos Financieros |
| `3` | Ingresos Extraordinarios |
| `4` | Ingresos por Arrendamientos |
| `5` | Ingresos por Venta de Activo Depreciable |
| `6` | Otros Ingresos |

> La mayoría de las ventas de bienes y servicios son Tipo `1`.

#### **Columna 6: Fecha Comprobante**
- Tipo: date
- Formato: `AAAAMMDD`
- Descripción: Fecha en que se realizó la venta/se emitió el comprobante.

#### **Columna 7: Fecha de Retención**
- Tipo: date | null
- Formato: `AAAAMMDD`
- Descripción: Fecha en que el cliente le realizó la retención de ITBIS y/o ISR al vendedor.
- Requiere: Si se llenan las columnas 10 (ITBIS Retenido por Terceros) o 12 (Retención Renta por Terceros), este campo es **obligatorio**.

#### **Columna 8: Monto Facturado**
- Tipo: decimal
- Descripción: Valor de la venta **sin incluir impuestos**.

#### **Columna 9: ITBIS Facturado**
- Tipo: decimal
- Descripción: ITBIS cobrado al cliente en el comprobante.

#### **Columna 10: ITBIS Retenido por Terceros**
- Tipo: decimal | null
- Descripción: Monto de ITBIS que el cliente retuvo al vendedor (el vendedor no cobró todo el ITBIS, el cliente lo retendrá para darlo a la DGII).
- Requiere: Col. 7 (Fecha de Retención) completa.

#### **Columna 11: ITBIS Percibido** *(campo reservado)*
- Tipo: decimal | null
- Estado actual: **No habilitado** hasta que exista normativa de percepción.

#### **Columna 12: Retención Renta por Terceros**
- Tipo: decimal | null
- Descripción: ISR retenido por el cliente al vendedor por prestación/locación de servicios.
- Requiere: Col. 7 (Fecha de Retención) completa.

#### **Columna 13: ISR Percibido** *(campo reservado)*
- Tipo: decimal | null
- Estado actual: **No habilitado**.

#### **Columna 14: Impuesto Selectivo al Consumo**
- Tipo: decimal | null
- Descripción: ISC de una venta gravada con este impuesto.

#### **Columna 15: Otros Impuestos/Tasas**
- Tipo: decimal | null

#### **Columna 16: Monto Propina Legal**
- Tipo: decimal | null
- Descripción: 10% de propina legal (Ley 54-32).

#### **Columnas 17–23: Formas de cobro** *(no todas son obligatorias)*
- Tipo: decimal | null para cada una
- Descripción: El monto total de la factura debe distribuirse entre estas columnas según cómo se cobró.
- **Regla:** La suma de las columnas 17 a 23 debe ser **igual al total de la factura** (Monto + Impuestos).

| Columna | Campo | Descripción |
|---|---|---|
| 17 | Efectivo | Pago en cash |
| 18 | Cheque / Transferencia / Depósito | Pagos bancarios |
| 19 | Tarjeta Débito/Crédito | Pagos con tarjeta |
| 20 | Venta a Crédito | Monto no cobrado aún (a crédito) |
| 21 | Bonos o Certificados de Regalo | Pagos con bonos/gift cards |
| 22 | Permuta | Intercambio de bienes sin dinero |
| 23 | Otras Formas de Ventas | Cualquier otro método no especificado |

---

## 5. CASOS Y COMBINACIONES QUE EL SISTEMA DEBE ENTENDER

### 5.1 Cuándo un comprobante aparece en el 606 DOS veces

Un mismo NCF puede aparecer en dos filas del 606 cuando:
- **Primera fila:** Se registra la compra con su fecha de comprobante (Col. 6), sin fecha de pago (Col. 7 vacía).
- **Segunda fila:** Cuando se paga (en un mes distinto), se vuelve a registrar el mismo NCF para declarar la retención de ISR y/o ITBIS, con fecha pago (Col. 7 llena) y los campos de retención correspondientes.

En la segunda fila, la fecha del comprobante (Col. 6) debe ser **idéntica** a la del primer reporte.

### 5.2 Monto Facturado vs. Monto Total de la Factura

En el **607**, el campo "Monto Facturado" (Col. 8) es **sin impuestos**. El total real de la factura es:
```
Total factura = Monto Facturado + ITBIS + ISC + Otros Impuestos + Propina Legal
```
Y ese total debe coincidir con la suma de los métodos de pago (Cols. 17–23).

En el **606**, el monto se divide en "Monto Facturado en Servicios" + "Monto Facturado en Bienes", ambos sin impuestos.

### 5.3 Notas de crédito/débito en el 607

Cuando se emite una nota de crédito (B04/E34) o débito (B03/E33):
- El campo Col. 3 tiene el NCF de la nota (B04XXXXXXXX o B03XXXXXXXX)
- El campo Col. 4 tiene el NCF original que se está modificando
- Los montos pueden ser negativos (en el caso de notas de crédito que reducen el total)

### 5.4 Reportabilidad de facturas de consumo en el 607

| Monto de la factura B02/E32 | ¿Se reporta en 607? | ¿Se requiere ID del cliente? |
|---|---|---|
| < RD$250,000 | **NO** (desde julio 2018) | N/A |
| ≥ RD$250,000 | **SÍ** | **Obligatorio** (cédula/pasaporte) |

### 5.5 Comprobante B17 en el 606: campos especiales

El comprobante para Pagos al Exterior (B17/E47) tiene una regla muy específica en el 606:
- El RNC/Cédula de la Col. 1 es el **mismo del encabezado del formato** (el contribuyente mismo se emite a sí mismo el comprobante para registrar el pago al exterior).
- Los siguientes campos **no se llenan**: ITBIS Retenido, ITBIS Proporcionalidad, ITBIS al Costo, ISR Percibido, ISC, Otros Impuestos, Propina Legal.

---

## 6. PROCESO DE VALIDACIÓN Y ESTADOS DE ENVÍO

### 6.1 Flujo de un envío al sistema DGII

```
1. Contribuyente llena el formato (Excel) → 
2. Genera archivo TXT → 
3. Pre-valida con herramienta local → 
4. Envía por Oficina Virtual → 
5. Sistema DGII valida los NCF → 
6. Asigna número de referencia → 
7. Estado cambia según validación
```

### 6.2 Estados de validación del archivo enviado

| Estado | Significado |
|---|---|
| **Recibido** | El archivo ingresó al sistema, pendiente de validación |
| **En proceso** | Validando los NCF contra la base de datos DGII |
| **Completado** | Sin inconsistencias, aceptado. Se puede ver el adelanto de ITBIS calculado |
| **Error** | Uno o más NCF tienen problemas. Ver "Detalle Validación" para ver cuáles |

### 6.3 Alertas de validación más comunes (y qué significan para el modelo)

| Alerta | Causa | Qué debe hacer el sistema |
|---|---|---|
| RNC/Cédula Inactivo | El proveedor está inactivo o fallecido | Excluir el NCF del 606 |
| NCF No habilitado | RNC del emisor en estado "Bloqueo" | Contactar proveedor; no incluir en 606 |
| NCF no existe o fue eliminado | Secuencia anulada | Contactar proveedor para sustitución |
| NCF no autorizado por DGII | Secuencia no solicitada | Contactar proveedor para sustitución |
| NCF ya se encuentra reportado | Duplicado en el mismo período | Eliminar el duplicado |
| NCF afectado por Nota de Crédito no remitido | La nota de crédito modifica un NCF no reportado | Incluir el NCF original en el mismo reporte |
| NCF de Compras (alerta) | Persona física registrada emitiendo tipo incorrecto | Solicitar NCF válido para Crédito Fiscal al proveedor |
| RNC no registrado como contribuyente | Proveedor sin RNC activo | Solicitar NCF de Compras en vez de Crédito Fiscal |
| Emisor debe emitir secuencia electrónica | Emisor obligado a e-CF pero envía NCF papel | Solicitar e-CF al proveedor |

---

## 7. MAPA CONCEPTUAL: FLUJO DE COMPROBANTE EN EL SISTEMA

```
EMISOR                          RECEPTOR
  │                                │
  │── Emite NCF/e-NCF ────────────>│
  │   (venta, ingreso)             │ (compra, gasto)
  │                                │
  │   Registra en 607              │   Registra en 606
  │   (ventas de ese período)      │   (compras de ese período)
  │                                │
  │── Envía 607 a DGII             │── Envía 606 a DGII
  │   (hasta día 15)               │   (hasta día 15)
  │                                │
  │   DGII valida NCF ────────────>│   DGII valida NCF
  │   en base de datos             │   en base de datos
  │                                │
  │   Si retención:                │   Si retención:
  │   ITBIS/ISR recibido           │   ITBIS/ISR entregado a DGII
  │   aparece en 607               │   aparece en 606 + pago
```

---

## 8. REFERENCIA RÁPIDA: QUÉ VA EN CADA FORMATO

| Situación | Formato | Columnas clave |
|---|---|---|
| Compra con crédito fiscal recibido | 606 | NCF B01/E31, ITBIS Facturado, ITBIS Adelantar |
| Venta con crédito fiscal emitido | 607 | NCF B01/E31, ITBIS Facturado, Tipo Ingreso |
| Compra a informal sin RNC | 606 | NCF B11/E41, Tipo Id = 2 (cédula del informal) |
| Gasto de empleado (caja chica) | 606 | NCF B13/E43 |
| Venta al gobierno | 607 | NCF B15/E45 |
| Exportación | 607 | NCF B16/E46, ITBIS = 0 |
| Pago a no residente | 606 | NCF B17/E47, campos especiales de B17 |
| Nota de crédito recibida | 606 | NCF B04, campo NCF Modificado lleno |
| Nota de débito emitida | 607 | NCF B03, campo NCF Modificado lleno |
| Retención de ITBIS al proveedor | 606 | Col. 7 (fecha pago) + Col. 12 (ITBIS Retenido) |
| Retención de ISR al proveedor | 606 | Col. 7 + Col. 17 (tipo) + Col. 18 (monto) |
| Retención de ITBIS por el cliente | 607 | Col. 7 (fecha retención) + Col. 10 (ITBIS Retenido por Terceros) |
