# Comprobantes Fiscales Dominicanos: Estructura, Tipos y Modelo de Datos
## Documento de Referencia para Sistemas LLM — DGII República Dominicana

---

## 1. CONTEXTO Y MARCO LEGAL

Los **Comprobantes Fiscales (NCF)** y los **Comprobantes Fiscales Electrónicos (e-CF / e-NCF)** son el eje central del sistema de facturación tributaria de la República Dominicana, regulado por la Dirección General de Impuestos Internos (DGII).

### Normativa clave que debe conocer el sistema:

| Norma | Descripción |
|---|---|
| **Norma General 06-2018** | Regula los Comprobantes Fiscales (NCF) en papel/tradicionales |
| **Norma General 07-2018** | Establece la obligación de remisión de información (606/607/608) |
| **Norma General 05-2019** | Introduce los tipos de e-CF (electrónicos) |
| **Norma General 10-2018** | Ajusta el umbral de facturas de consumo en el 607 a RD$250,000 |
| **Ley 32-23** | Ley de facturación electrónica — obliga a ciertos contribuyentes a emitir e-CF |
| **Decreto 587-24** | Reglamento de aplicación de la Ley 32-23 |
| **Aviso 13-18** | Define la estructura física de los NCF (11 caracteres, serie B) |
| **Aviso 24-19** | Define la estructura física de los e-NCF (13 caracteres, serie E) |

### Implicación para el sistema:
Un LLM que maneje facturas dominicanas **debe distinguir en todo momento** si está procesando un NCF tradicional (serie B, 11 caracteres) o un e-NCF electrónico (serie E, 13 caracteres), porque tienen tipos, validaciones, formatos de reporte y flujos fiscales distintos.

---

## 2. ESTRUCTURA DE LOS NÚMEROS DE COMPROBANTE

### 2.1 NCF Tradicional (serie B) — 11 caracteres

```
B  |  XX  |  XXXXXXXX
^     ^        ^
|     |        └── 8 dígitos: número secuencial
|     └─────────── 2 dígitos: código de tipo de comprobante (01–17)
└───────────────── Letra fija "B" (serie)
```

**Ejemplo real:** `B0100000001`
- B = serie tradicional
- 01 = Factura de Crédito Fiscal
- 00000001 = primer comprobante emitido

**Longitud total: 11 caracteres alfanuméricos**

> ⚠️ **CRÍTICO**: NCF emitidos antes de mayo 2018 podían tener estructura de 19 posiciones. El sistema debe aceptar ambas longitudes (11 y 19) en campos históricos de 606/607, pero NUNCA generar NCF nuevos de 19 posiciones.

---

### 2.2 e-NCF Electrónico (serie E) — 13 caracteres

```
E  |  XX  |  XXXXXXXXXX
^     ^         ^
|     |         └── 10 dígitos: número secuencial
|     └─────────── 2 dígitos: código de tipo (31–47)
└───────────────── Letra fija "E" (serie electrónica)
```

**Ejemplo real:** `E310000000001`
- E = serie electrónica
- 31 = Factura de Crédito Fiscal Electrónica
- 0000000001 = primer e-CF emitido

**Longitud total: 13 caracteres alfanuméricos**

> Los e-CF además llevan **firma digital** del emisor y son validados en tiempo real por la DGII antes de ser considerados válidos.

---

### 2.3 Tabla comparativa: NCF vs e-NCF

| Atributo | NCF (tradicional) | e-NCF (electrónico) |
|---|---|---|
| Letra de serie | `B` | `E` |
| Longitud | 11 caracteres | 13 caracteres |
| Código de tipo | 01–17 | 31–47 |
| Soporte físico | Papel impreso (imprenta autorizada) | Documento XML firmado digitalmente |
| Validación DGII | Post-emisión (reporte mensual) | Pre-emisión o tiempo real |
| Marco legal | NG 06-2018 / Aviso 13-18 | NG 05-2019 / Ley 32-23 / Aviso 24-19 |
| Firma digital | No requerida | Obligatoria |
| Equivalente electrónico | — | Los e-CF **reemplazan** a los NCF para emisores obligados |

---

## 3. TIPOS DE COMPROBANTES FISCALES

### 3.1 Categorías conceptuales

Antes de entrar en los tipos específicos, el sistema debe entender que los comprobantes se agrupan en **tres grandes categorías funcionales**:

**Categoría A — Transaccionales de uso general:**
Documentos que registran operaciones comerciales regulares entre contribuyentes o hacia consumidores finales. Son los más comunes y los que generan crédito fiscal de ITBIS.

**Categoría B — Documentos de ajuste:**
Notas de Débito y Crédito. Solo pueden modificar comprobantes previamente emitidos. Siempre deben referenciar el NCF/e-NCF original que afectan.

**Categoría C — Comprobantes especiales:**
Documentos para situaciones específicas: compras a informales, gastos menores, ventas al gobierno, exportaciones, pagos al exterior, regímenes especiales. Tienen restricciones y usos particulares.

---

### 3.2 Tipos de NCF Tradicionales (serie B)

#### **Tipo 01 — Factura de Crédito Fiscal**
- **Código:** `B01XXXXXXXX`
- **Uso:** Transacciones de compra/venta de bienes y/o servicios **entre contribuyentes registrados**.
- **Efecto tributario:** El comprador puede usarlo para:
  - Sustentar gastos y costos en la **Declaración de ISR**
  - Reclamar crédito del **ITBIS** (IVA dominicano)
- **Quién lo emite:** Cualquier contribuyente autorizado con RNC activo
- **Quién lo recibe:** Empresas o personas con RNC que necesiten crédito fiscal
- **Campo Tipo Identificación en 606:** El RNC del proveedor va con Tipo `1`
- **⚠️ Error común:** No confundir con Tipo 02. Un consumidor final que pide crédito fiscal debe exigir un Tipo 01, no un Tipo 02.

#### **Tipo 02 — Factura de Consumo**
- **Código:** `B02XXXXXXXX`
- **Uso:** Ventas a **consumidores finales** que no necesitan crédito fiscal.
- **Efecto tributario:** NINGUNO. No puede usarse para crédito de ITBIS ni para deducción de ISR.
- **Restricción 607:** Solo se incluye en el reporte 607 si el monto es **≥ RD$250,000** (desde julio 2018, según NG 10-2018). En ese caso se requiere cédula del comprador.
- **⚠️ Crítico para el modelo:** Facturas de consumo por montos menores a RD$250,000 NO se reportan individualmente en el 607. Las de monto ≥ 250,000 SÍ se reportan con identificación del comprador.

#### **Tipo 03 — Nota de Débito**
- **Código:** `B03XXXXXXXX`
- **Uso:** Recuperar costos adicionales **posteriores a la venta** (intereses por mora, fletes, ajustes de precio al alza, etc.)
- **Regla fundamental:** Siempre debe referenciar un NCF anterior (campo "NCF Modificado" en 607/606).
- **Emisor:** El vendedor/prestador de servicio
- **Receptor:** El mismo comprador del comprobante original
- **Efecto:** Aumenta el monto adeudado por el comprador

#### **Tipo 04 — Nota de Crédito**
- **Código:** `B04XXXXXXXX`
- **Uso:** Anulaciones, devoluciones, descuentos, bonificaciones o corrección de errores **posteriores a la venta**.
- **Regla fundamental:** Siempre debe referenciar un NCF anterior (campo "NCF Modificado").
- **Emisor:** El vendedor/prestador de servicio
- **Receptor:** El mismo comprador del comprobante original
- **Efecto:** Reduce el monto adeudado por el comprador
- **⚠️ Para el 606:** Si una nota de crédito afecta un NCF que no ha sido previamente reportado en el 606, se genera la alerta "NCF afectado por Nota de Crédito no ha sido remitido".

#### **Tipo 11 — Comprobante de Compras**
- **Código:** `B11XXXXXXXX`
- **Uso:** Lo emite el **comprador** cuando adquiere bienes/servicios de personas **no registradas como contribuyentes** (informales, personas sin RNC).
- **Emisor:** El comprador (no el vendedor)
- **⚠️ Inversión de roles:** Este es el único tipo donde el comprador emite el comprobante. Es autoemitido por el receptor de la factura.
- **Efecto tributario:** Permite sustentar el gasto ante la DGII aunque el proveedor no esté en el sistema.
- **En el 606:** El campo RNC/Cédula llevaría la cédula del proveedor informal (Tipo Id = `2` si es cédula).

#### **Tipo 12 — Comprobante de Registro Único de Ingresos (RUI)**
- **Código:** `B12XXXXXXXX`
- **Uso:** Resumen de transacciones diarias con consumidores finales, especialmente para negocios con muchas operaciones pequeñas de productos/servicios **exentos de ITBIS**.
- **Característica:** Es un resumen/consolidado diario, no un comprobante por transacción individual.
- **Efecto tributario:** No genera crédito de ITBIS.

#### **Tipo 13 — Comprobante para Gastos Menores**
- **Código:** `B13XXXXXXXX`
- **Uso:** Sustentar gastos pequeños realizados por el **personal** de una empresa, en RD o en el exterior, relacionados con el trabajo: consumibles, pasajes, transporte público, estacionamiento, peajes.
- **Emisor:** La empresa que sufraga el gasto de su empleado
- **Límite:** Generalmente para montos menores (no definido exactamente por ley, pero es para gastos de caja chica)
- **En el 606:** Se incluye normalmente como compra.

#### **Tipo 14 — Comprobante para Regímenes Especiales**
- **Código:** `B14XXXXXXXX`
- **Uso:** Ventas a personas físicas o jurídicas acogidas a **regímenes especiales** (zonas francas industriales, turismo, etc.) con exenciones de ITBIS o ISC ratificadas por el Congreso.
- **Efecto:** Venta exenta. El comprador no paga ITBIS/ISC por estar amparado en ley especial.

#### **Tipo 15 — Comprobante Gubernamental**
- **Código:** `B15XXXXXXXX`
- **Uso:** Ventas al **Gobierno Central, instituciones descentralizadas y autónomas, Seguridad Social** y cualquier entidad pública no comercial.
- **Distinción importante:** Las entidades gubernamentales tienen su propio tipo de comprobante. NO se les emite un Tipo 01 o Tipo 02 en este contexto.
- **En el 606:** Cuando el comprador es gobierno, el campo Tipo Bienes y Servicios comprados puede ser relevante.

#### **Tipo 16 — Comprobante para Exportaciones**
- **Código:** `B16XXXXXXXX`
- **Uso:** Ventas de bienes **fuera del territorio dominicano**, usado por exportadores nacionales y empresas de zonas francas.
- **Efecto:** Tasa 0% de ITBIS (exportaciones están exentas/0 rate).
- **Incluye:** Zonas francas comerciales e industriales que exportan.

#### **Tipo 17 — Comprobante para Pagos al Exterior**
- **Código:** `B17XXXXXXXX`
- **Uso:** Pagos de **rentas dominicanas** a personas físicas o jurídicas **no residentes fiscales** en RD.
- **Regla crítica:** Al emitir un B17, se debe aplicar **retención total del ISR** según los artículos 297 y 305 del Código Tributario.
- **En el 606 (regla especial):** Al colocar un B17, se debe usar el **mismo RNC/Cédula del encabezado** del formato. Además, NO requiere llenado de: ITBIS Retenido, ITBIS sujeto a Proporcionalidad, ITBIS llevado al Costo, ISR Percibido en compras, ISC, Otros Impuestos/Tasas, Monto Propina Legal.
- **⚠️ Dato crítico de modelado:** El B17 tiene un conjunto de campos obligatorios diferente al resto de los tipos en el 606.

---

### 3.3 Tipos de e-NCF Electrónicos (serie E)

Los e-CF son la versión digital de los NCF. La Ley 32-23 obliga a los grandes y medianos contribuyentes a migrar a este sistema. Los códigos de tipo son equivalentes pero en el rango 30–47.

| Tipo e-CF | Equivalente NCF | Descripción |
|---|---|---|
| **E31** | B01 | Factura de Crédito Fiscal Electrónica |
| **E32** | B02 | Factura de Consumo Electrónica |
| **E33** | B03 | Nota de Débito Electrónica |
| **E34** | B04 | Nota de Crédito Electrónica |
| **E41** | B11 | Comprobante Electrónico de Compras |
| **E43** | B13 | Comprobante Electrónico para Gastos Menores |
| **E44** | B14 | Comprobante Electrónico para Regímenes Especiales |
| **E45** | B15 | Comprobante Electrónico Gubernamental |
| **E46** | B16 | Comprobante Electrónico para Exportaciones |
| **E47** | B17 | Comprobante Electrónico para Pagos al Exterior |

> **Nótese que NO hay e-CF equivalente al Tipo 12 (RUI).** El Registro Único de Ingresos solo existe en formato tradicional.

---

## 4. VALIDACIONES CRÍTICAS DEL NCF/e-NCF

El sistema debe manejar los siguientes estados y reglas de validación:

### 4.1 Estados de un NCF/e-NCF en el sistema DGII

| Estado | Significado | Acción del sistema |
|---|---|---|
| **Activo / Habilitado** | Válido para emitir o reportar | Aceptar normalmente |
| **Agotado** | La secuencia asignada fue usada completamente | No se puede emitir más; solicitar nueva secuencia |
| **Bloqueado / Inhabilitado** | RNC del emisor en estatus "Bloqueo" | No aceptar en 606 (alerta "NCF no habilitado") |
| **Anulado / Eliminado** | La secuencia fue eliminada | No aceptar en 606 (alerta "NCF no existe o fue eliminado") |
| **No autorizado** | Secuencia no solicitada previamente | No aceptar (alerta "NCF no autorizado por DGII") |
| **Ya reportado** | El NCF ya fue incluido en un 606 anterior | No duplicar (alerta "NCF ya se encuentra reportado") |

### 4.2 Reglas de validación de identidad del emisor/receptor

El sistema debe verificar para cada comprobante:

1. **RNC activo:** El RNC del emisor debe estar activo en DGII (no fallecido, no cancelado).
2. **Tipo de comprobante coherente:** Un contribuyente con Cédula (persona física) que está registrado en DGII debe emitir NCF válidos para Crédito Fiscal (B01/E31), no comprobantes de compras (B11/E41).
3. **Facturador Electrónico:** Si el emisor está obligado por Ley 32-23 a emitir e-CF, NO debe estar emitiendo NCF serie B. Se genera alerta "Emisor debe emitir una secuencia electrónica válida".
4. **Receptor correcto en e-CF:** El RNC/Cédula del receptor en el e-CF debe coincidir con el del comprador. Si no coincide, se genera alerta "Emisor o receptor del e-CF no coinciden".

### 4.3 Reglas de notas de crédito/débito (Tipos 03, 04, 33, 34)

- Siempre deben tener el campo **"NCF/e-NCF Modificado"** completo.
- El NCF afectado debe haber sido **previamente reportado** en el 606 del comprador.
- Si el NCF original fue de 19 posiciones (anterior a mayo 2018), se acepta la estructura antigua en el campo modificado.
- Si se reporta una nota de crédito que afecta un NCF no existente en el sistema, se genera la alerta correspondiente.

---

## 5. TABLA MAESTRA DE TIPOS: REFERENCIA RÁPIDA

```
CÓDIGO  | TIPO                          | SERIE | LONGITUD | CRÉDITO ITBIS | DEDUCE ISR | EMISOR
--------|-------------------------------|-------|----------|---------------|------------|--------
B01     | Crédito Fiscal                |  B    |   11     |     SÍ        |    SÍ      | Vendedor
B02     | Consumo                       |  B    |   11     |     NO        |    NO      | Vendedor
B03     | Nota de Débito                |  B    |   11     |  Ajuste       |  Ajuste    | Vendedor
B04     | Nota de Crédito               |  B    |   11     |  Ajuste       |  Ajuste    | Vendedor
B11     | Comprobante de Compras        |  B    |   11     |   Limitado    |    SÍ      | Comprador(!)
B12     | Registro Único de Ingresos    |  B    |   11     |     NO        |  Limitado  | Vendedor
B13     | Gastos Menores                |  B    |   11     |   Limitado    |    SÍ      | Empresa
B14     | Regímenes Especiales          |  B    |   11     |   Exento      |    SÍ      | Vendedor
B15     | Gubernamental                 |  B    |   11     |   Exento      |    SÍ      | Vendedor
B16     | Exportaciones                 |  B    |   11     |   Exento      |    SÍ      | Exportador
B17     | Pagos al Exterior             |  B    |   11     |     NO        | Retención  | Pagador
E31     | Crédito Fiscal Electrónica    |  E    |   13     |     SÍ        |    SÍ      | Vendedor
E32     | Consumo Electrónica           |  E    |   13     |     NO        |    NO      | Vendedor
E33     | Nota de Débito Electrónica    |  E    |   13     |  Ajuste       |  Ajuste    | Vendedor
E34     | Nota de Crédito Electrónica   |  E    |   13     |  Ajuste       |  Ajuste    | Vendedor
E41     | Comprobante Compras Electr.   |  E    |   13     |   Limitado    |    SÍ      | Comprador(!)
E43     | Gastos Menores Electrónico    |  E    |   13     |   Limitado    |    SÍ      | Empresa
E44     | Regímenes Especiales Electr.  |  E    |   13     |   Exento      |    SÍ      | Vendedor
E45     | Gubernamental Electrónico     |  E    |   13     |   Exento      |    SÍ      | Vendedor
E46     | Exportaciones Electrónico     |  E    |   13     |   Exento      |    SÍ      | Exportador
E47     | Pagos al Exterior Electrónico |  E    |   13     |     NO        | Retención  | Pagador
```

---

## 6. TIPOS DE IDENTIFICACIÓN DE CONTRIBUYENTES

En los formatos 606 y 607, cada parte (comprador/vendedor) debe identificarse con un tipo de documento:

| Código | Tipo de Documento | Descripción |
|---|---|---|
| `1` | RNC | Registro Nacional del Contribuyente (personas jurídicas y físicas con RNC) |
| `2` | Cédula | Cédula de identidad y electoral dominicana |
| `3` | Pasaporte / ID Tributaria | Para extranjeros sin RNC |

**Regla de validación:** El tipo de identificación debe ser coherente con el número registrado. Si el campo tiene 9 dígitos es típicamente un RNC (Tipo 1), si tiene 11 dígitos es una cédula (Tipo 2).

---

## 7. CASOS ESPECIALES Y AMBIGÜEDADES QUE EL SISTEMA DEBE MANEJAR

### 7.1 NCF históricos (19 posiciones)
Comprobantes emitidos **antes de mayo 2018** tienen 19 posiciones alfanuméricas. El sistema debe:
- Aceptarlos en campos de "NCF Modificado" (notas de crédito/débito que afectan al pasado)
- Aceptarlos en campos de retenciones (cuando se reporta la fecha de pago posterior de un NCF antiguo)
- NUNCA generarlos como nuevos

### 7.2 Facturas de consumo (B02/E32) — umbral RD$250,000
- **Antes de mayo 2018:** Sin umbral, no se reportaban en 607
- **Mayo-junio 2018:** Umbral de RD$50,000, con cédula del comprador
- **Desde julio 2018 (NG 10-2018):** Umbral de **RD$250,000**, con documento de identidad del comprador
- **Por debajo del umbral:** NO se incluyen en el 607 individualmente

### 7.3 Reporte de retenciones en segunda presentación
Cuando un comprobante se pagó en fecha distinta a su emisión, puede reportarse dos veces en el 606:
1. Primera vez: al momento de la compra (con fecha comprobante)
2. Segunda vez: al momento del pago (para reportar la retención, con fecha de pago)
En la segunda remisión, la **fecha del comprobante debe ser la misma que en el primer envío**.

### 7.4 Contribuyentes obligados a facturación electrónica
A partir de la Ley 32-23, los grandes contribuyentes locales y medianos están obligados a emitir e-CF. Si uno de estos emisores envía un NCF serie B al sistema, se debe generar la alerta de validación "Emisor debe emitir una secuencia electrónica válida" y no procesar el comprobante como válido para crédito fiscal.

---

## 8. IMPUESTOS ASOCIADOS A LOS COMPROBANTES

### 8.1 ITBIS (Impuesto a la Transferencia de Bienes Industrializados y Servicios)
- Equivalente al IVA en otros países
- Tasa general: **18%**
- Tasa reducida: **16%** (algunos bienes)
- Exento: Servicios de salud, educación, algunos alimentos, exportaciones
- Solo genera crédito fiscal en comprobantes Tipo 01/E31 (y algunos especiales)

### 8.2 ISR (Impuesto Sobre la Renta) — Retenciones
- Aplica especialmente en servicios prestados por personas físicas
- El cliente puede actuar como agente de retención
- Los Tipos 17/E47 siempre generan retención del 100% del ISR aplicable
- El campo "Tipo de Retención en ISR" en el 606 tiene 9 categorías posibles

### 8.3 ISC (Impuesto Selectivo al Consumo)
- Aplica a productos específicos: alcohol, tabaco, combustibles, vehículos, etc.
- Se registra en el campo "Impuesto Selectivo al Consumo" del 606/607

### 8.4 Propina Legal
- 10% obligatorio establecido por la Ley 54-32
- Aplica principalmente en servicios de restauración/hotelería
- Se registra en campo separado "Monto Propina Legal" en 606/607

---

## 9. RESUMEN DE PROPIEDADES CLAVE PARA MODELADO

Cada comprobante fiscal debe poder representarse con al menos estas propiedades en el modelo de datos:

```
ncf_number          : string (11 o 13 caracteres, ej: B0100000001 / E310000000001)
serie               : enum("B", "E")
tipo_codigo         : string (ej: "01", "31")
tipo_descripcion    : string (ej: "Factura de Crédito Fiscal")
es_electronico      : boolean
es_nota_ajuste      : boolean (true para tipos 03, 04, 33, 34)
ncf_modificado      : string | null (obligatorio si es_nota_ajuste = true)
fecha_emision       : date (AAAAMMDD)
fecha_pago          : date | null
rnc_emisor          : string
tipo_id_emisor      : enum(1, 2, 3)
rnc_receptor        : string | null
tipo_id_receptor    : enum(1, 2, 3) | null
monto_facturado     : decimal (sin impuestos)
itbis_facturado     : decimal
itbis_retenido      : decimal
isr_retenido        : decimal
isc                 : decimal
otros_impuestos     : decimal
propina_legal       : decimal
monto_total         : decimal (suma de todo lo anterior)
forma_pago          : enum o flags (efectivo, cheque, tarjeta, crédito, permuta, bonos, otras)
estado              : enum("activo", "anulado", "bloqueado", "agotado")
periodo_reporte     : string (AAAAMM)
tipo_ingreso        : enum(1..6) | null (solo aplica para 607)
tipo_bien_servicio  : enum(1..11) | null (solo aplica para 606)
```
