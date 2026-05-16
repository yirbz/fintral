# Lógica de Decisión y Reglas de Negocio para Facturas NCF/e-NCF
## Guía de Razonamiento para Sistemas LLM — DGII República Dominicana

---

## 1. PROPÓSITO DE ESTE DOCUMENTO

Este documento traduce las reglas del sistema tributario dominicano en **lógica de decisión explícita** para que un LLM pueda razonar correctamente sobre cualquier operación con comprobantes fiscales. Está organizado como árboles de decisión, reglas condicionales y patrones de error comunes.

---

## 2. ÁRBOL DE DECISIÓN: ¿QUÉ TIPO DE NCF DEBO USAR?

### Paso 1: ¿El emisor está obligado a facturación electrónica?

```
¿El emisor está en la lista de obligados a e-CF (Ley 32-23)?
│
├── SÍ → SOLO puede emitir serie E (e-NCF, 13 caracteres)
│         → Continuar con tipos E31–E47
│
└── NO → Puede emitir serie B (NCF, 11 caracteres) o e-NCF si está inscrito
          → Continuar con tipos B01–B17
```

### Paso 2: ¿Quién es el receptor de la venta?

```
¿A quién se le está vendiendo?
│
├── Otra empresa/contribuyente con RNC que necesita deducir
│   └── → Tipo 01 (B01 / E31): Factura de Crédito Fiscal
│
├── Consumidor final (persona natural sin necesidad de crédito fiscal)
│   └── → Tipo 02 (B02 / E32): Factura de Consumo
│
├── Entidad del gobierno dominicano
│   └── → Tipo 15 (B15 / E45): Gubernamental
│
├── Empresa con régimen especial (zona franca, turismo con exención)
│   └── → Tipo 14 (B14 / E44): Regímenes Especiales
│
├── Cliente en el extranjero (exportación)
│   └── → Tipo 16 (B16 / E46): Exportaciones
│
└── Persona no residente fiscal a quien se le paga renta dominicana
    └── → Tipo 17 (B17 / E47): Pagos al Exterior
```

### Paso 3: ¿Es un ajuste a una venta anterior?

```
¿Se está modificando un comprobante ya emitido?
│
├── SÍ, para cobrar más (intereses, fletes, ajustes)
│   └── → Tipo 03 (B03 / E33): Nota de Débito
│         → OBLIGATORIO: campo "NCF Modificado" con el NCF original
│
├── SÍ, para reducir (devolución, descuento, anulación)
│   └── → Tipo 04 (B04 / E34): Nota de Crédito
│         → OBLIGATORIO: campo "NCF Modificado" con el NCF original
│
└── NO → Usar los tipos del Paso 2
```

### Paso 4: ¿Es un comprobante autoemitido por el comprador?

```
¿Se está comprando a alguien que NO tiene RNC ni puede emitir facturas?
│
├── SÍ (informal, persona sin RNC)
│   └── → Tipo 11 (B11 / E41): Comprobante de Compras
│         → Lo emite el COMPRADOR, no el vendedor
│
├── Son gastos pequeños del personal de la empresa
│   └── → Tipo 13 (B13 / E43): Gastos Menores
│
└── Son ventas propias del día consolidadas (bienes exentos)
    └── → Tipo 12 (B12): Registro Único de Ingresos
          (no tiene equivalente electrónico)
```

---

## 3. REGLAS CONDICIONALES CRÍTICAS

### Regla 1: El NCF Modificado es obligatorio para notas de ajuste
```
SI tipo_comprobante IN (B03, B04, E33, E34):
    ncf_modificado DEBE estar lleno
    ncf_modificado DEBE existir en el sistema DGII
    ncf_modificado DEBE ser del mismo contribuyente (mismo RNC emisor)
    ncf_modificado DEBE haberse reportado previamente en 606/607
```

### Regla 2: Fecha de retención/pago es obligatoria cuando hay retenciones
```
EN 606:
SI itbis_retenido > 0:
    fecha_pago DEBE estar llena
SI monto_retencion_renta > 0:
    fecha_pago DEBE estar llena
    tipo_retencion_isr DEBE estar lleno (1–9)

EN 607:
SI itbis_retenido_por_terceros > 0:
    fecha_retencion DEBE estar llena
SI retencion_renta_por_terceros > 0:
    fecha_retencion DEBE estar llena
```

### Regla 3: Las columnas de forma de pago en el 607 deben sumar al total
```
total_cobrado = efectivo + cheque_transferencia + tarjeta + credito + bonos + permuta + otras_formas
total_factura = monto_facturado + itbis_facturado + isc + otros_impuestos + propina_legal

total_cobrado DEBE ser igual a total_factura
(con tolerancia de centavos por redondeo)
```
> ⚠️ No todas las columnas de forma de pago son obligatorias, pero las que se llenan deben sumar correctamente.

### Regla 4: Facturas de consumo y el umbral RD$250,000
```
SI tipo_comprobante IN (B02, E32):
    SI monto_total >= 250000:
        rnc_cedula_receptor DEBE estar lleno
        tipo_id_receptor DEBE estar lleno
        incluir_en_607 = TRUE
    SINO:
        incluir_en_607 = FALSE (no reportar individualmente)
```

### Regla 5: Comprobante B17/E47 en el 606 — campos especiales
```
SI tipo_comprobante IN (B17, E47):
    rnc_proveedor = rnc_del_encabezado (el mismo del contribuyente)
    itbis_retenido = NO APLICA (dejar vacío)
    itbis_proporcionalidad = NO APLICA
    itbis_al_costo = NO APLICA
    isr_percibido = NO APLICA
    isc = NO APLICA
    otros_impuestos = NO APLICA
    propina_legal = NO APLICA
    retención_isr = OBLIGATORIA (100% del ISR según arts. 297 y 305 CT)
```

### Regla 6: Longitud del NCF según generación
```
SI fecha_emision >= 2018-05:
    longitud_ncf DEBE ser 11 (serie B) o 13 (serie E)
SINO:
    longitud_ncf puede ser 19 (formato histórico)
    (solo aceptable en campos de NCF Modificado y retenciones)
```

### Regla 7: Coherencia entre tipo de comprobante y efectos tributarios
```
SI tipo_comprobante IN (B02, E32):
    genera_credito_itbis = FALSE
    deduce_isr = FALSE
    → No puede usarse para justificar crédito fiscal

SI tipo_comprobante IN (B01, E31, B11, E41, B13, E43, B14, E44, B15, E45):
    genera_credito_itbis = PUEDE (según el tipo específico)
    deduce_isr = TRUE (con las reglas del Art. 349)
```

### Regla 8: Validez del emisor por tipo de contribuyente
```
SI emisor tiene cédula (persona física) Y está registrado en DGII:
    tipo_ncf_permitido = B01 (Crédito Fiscal), no B11 (Comprobante de Compras)
    → Un proveedor con cédula y RNC debe emitir B01, no B11

SI emisor NO está registrado en DGII:
    el COMPRADOR debe emitir B11/E41 para sustentar la compra
```

---

## 4. PATRONES DE ERROR FRECUENTES Y SU DIAGNÓSTICO

### 4.1 Error: "NCF no habilitado" en validación
**Causa:** El proveedor tiene su RNC en estado "Bloqueo".
**Lo que el LLM debe entender:**
- El comprobante no es válido para crédito fiscal.
- El contribuyente debe contactar al proveedor para que regularice su situación.
- El NCF debe excluirse del 606 hasta que se resuelva.

### 4.2 Error: "NCF ya se encuentra reportado"
**Causa más común 1:** El mismo NCF fue ingresado dos veces en el mismo período (error humano, duplicado).
**Causa más común 2:** La segunda remisión de un NCF para reportar retención posterior. En este caso es correcto, pero la DGII puede mostrar la alerta. El sistema debe identificar si es una retención legítima de segunda presentación.
**Diferenciador:** Si la segunda fila tiene campos de retención llenos (fecha pago, ITBIS retenido, retención ISR), es una segunda remisión válida. Si los campos son idénticos a la primera fila, es un duplicado.

### 4.3 Error: "NCF afectado por Nota de Crédito no ha sido remitido"
**Causa:** Se reportó una nota de crédito (B04) pero el NCF original que modifica no existe en el 606 actual ni en períodos anteriores.
**Solución:** Incluir el NCF original en el mismo envío o verificar que fue reportado en un período anterior.

### 4.4 Error: "RNC/Cédula no registrada como contribuyente"
**Causa:** Se usó un NCF tipo B01 (Crédito Fiscal) con un proveedor que no está registrado como contribuyente en DGII.
**Lo que el LLM debe entender:** Si el proveedor no está en DGII, el comprador debió emitir un B11 (Comprobante de Compras) en lugar de recibir un B01. El B01 del proveedor no puede ser procesado.

### 4.5 Error: "Emisor debe emitir secuencia electrónica válida"
**Causa:** El proveedor está en la lista de obligados a e-CF (Ley 32-23) pero emitió un NCF serie B (papel).
**Lo que el LLM debe entender:** Este es un escenario de transición a la facturación electrónica. El comprador debe exigir un e-NCF (serie E) al proveedor obligado.

---

## 5. IMPACTO TRIBUTARIO DE CADA TIPO EN LAS DECLARACIONES

### 5.1 Declaración de ITBIS (IVA)

```
ITBIS a Pagar = ITBIS Cobrado en ventas (del 607)
              - ITBIS Pagado en compras deducible (del 606, Col. 15: ITBIS por Adelantar)
              - ITBIS Retenido por clientes (ya ingresó a DGII)
              + ITBIS Percibido cobrado a clientes (si aplica)
```

Solo los comprobantes **B01/E31** (y equivalentes especiales) generan ITBIS deducible en compras. Los B02/E32 no generan crédito.

### 5.2 Declaración de ISR (IR-2 / IR-1)

El campo "Tipo de Bienes y Servicios Comprados" del 606 alimenta directamente los anexos de la declaración de ISR:

| Tipo de Bien/Servicio (606) | Anexo ISR |
|---|---|
| 1 - Gastos de personal | Deducción de nómina |
| 2 - Trabajos, suministros, servicios | Gastos operativos |
| 3 - Arrendamientos | Gastos de alquiler |
| 4 - Activos fijos | Gastos de depreciación/amortización |
| 9 - Costo de venta | Costo de los bienes vendidos (COGS) |
| 10 - Adquisiciones de activos | Balance / activo fijo |

### 5.3 Anticipos y retenciones

- **ITBIS Retenido a proveedor (606, Col. 12):** El comprador lo retiene y lo entrega a DGII. El proveedor lo descuenta de su ITBIS a pagar.
- **ITBIS Retenido por cliente (607, Col. 10):** El vendedor pierde liquidez de ITBIS que el cliente retiene. Lo descuenta de su ITBIS a pagar.
- **ISR Retenido a proveedor (606, Col. 18):** El comprador actúa como agente de retención de ISR al contratar servicios.

---

## 6. DICCIONARIO DE ABREVIACIONES Y TÉRMINOS CLAVE

| Término | Significado |
|---|---|
| **NCF** | Número de Comprobante Fiscal (serie B, 11 caracteres) |
| **e-NCF** | Número de Comprobante Fiscal Electrónico (serie E, 13 caracteres) |
| **e-CF** | Comprobante Fiscal Electrónico (el documento en sí) |
| **DGII** | Dirección General de Impuestos Internos (autoridad tributaria RD) |
| **RNC** | Registro Nacional del Contribuyente (NIF dominicano para personas jurídicas y físicas con actividad comercial) |
| **ITBIS** | Impuesto a la Transferencia de Bienes Industrializados y Servicios (equivalente al IVA) |
| **ISR** | Impuesto Sobre la Renta |
| **ISC** | Impuesto Selectivo al Consumo (bienes específicos: alcohol, tabaco, combustible) |
| **ISC** | Impuesto Selectivo al Consumo |
| **OFV / OV** | Oficina Virtual (portal web de la DGII para remisión de reportes) |
| **NG** | Norma General (reglamento emitido por la DGII) |
| **CT** | Código Tributario dominicano (Ley 11-92 y sus modificaciones) |
| **Art. 349** | Artículo de la Ley 11-92 que regula la proporcionalidad del ITBIS deducible |
| **606** | Formato de reporte mensual de compras |
| **607** | Formato de reporte mensual de ventas |
| **608** | Formato de reporte de comprobantes anulados |
| **Proporcionalidad** | Mecanismo para prorratear ITBIS entre actividades gravadas y exentas |
| **Agente de retención** | Contribuyente obligado a retener impuestos al momento de pagar al proveedor |
| **Crédito fiscal** | Derecho a deducir el ITBIS pagado en compras del ITBIS cobrado en ventas |

---

## 7. PREGUNTAS QUE EL LLM DEBE PODER RESPONDER CON ESTE CONOCIMIENTO

Con los tres documentos de esta serie, el LLM debe poder responder con precisión preguntas como:

1. "¿Qué tipo de NCF debo usar para venderle a una empresa del gobierno?"
2. "Mi proveedor me dio una factura B02, ¿puedo usar eso para reclamar el ITBIS?"
3. "¿Qué pasa si el NCF de mi proveedor aparece como 'no habilitado' en la validación del 606?"
4. "Compré servicios a un diseñador freelance sin RNC, ¿cómo lo reporto en el 606?"
5. "¿Cuándo tengo que llenar la fecha de pago en el 606?"
6. "¿Las facturas de consumo de RD$50,000 van en el 607?"
7. "Mi cliente me retuvo ITBIS, ¿en qué columna del 607 lo registro?"
8. "¿Cuál es la diferencia entre ITBIS llevado al Costo e ITBIS por Adelantar?"
9. "¿Qué longitud tiene un e-NCF electrónico vs un NCF tradicional?"
10. "Emití una nota de crédito pero no había reportado el NCF original, ¿qué hago?"

---

## 8. LIMITACIONES Y ADVERTENCIAS PARA EL LLM

1. **Este sistema evoluciona:** Las normas generales de la DGII pueden actualizarse. Las reglas aquí documentadas corresponden al marco vigente a febrero 2026 (según instructivos oficiales). El sistema debe estar preparado para recibir actualizaciones normativas.

2. **No es asesoría legal:** Este documento describe el sistema técnico. Para decisiones tributarias específicas de un contribuyente, se debe consultar a un contador o abogado tributario licenciado en República Dominicana.

3. **Montos en pesos dominicanos (RD$):** Todos los umbrales (como RD$250,000) están en pesos dominicanos. Si el sistema maneja múltiples monedas, debe asegurarse de convertir correctamente.

4. **La facturación electrónica está en expansión:** La Ley 32-23 está en proceso de implementación gradual. La lista de contribuyentes obligados a e-CF crece periódicamente. Lo que hoy es opcional puede ser obligatorio mañana para cierto tipo de contribuyente.

5. **El campo "ITBIS Percibido" e "ISR Percibido" están deshabilitados:** A la fecha de este documento, estos campos no se utilizan porque no existe aún la normativa de régimen de percepción en RD. El sistema no debe requerir ni procesar esos campos.
