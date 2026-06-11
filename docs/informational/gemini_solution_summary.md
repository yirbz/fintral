# Solución: Manejo de Abandono de Usuario en Certificación ECF

## Problema Original
Cuando un usuario abandonaba el proceso de certificación (al navegar fuera de la pantalla), los registros de empresa incompletos se quedaban en Alanube, generando desorden en el sandbox y complicando futuros intentos de certificación.

## Solución Implementada

### 1. **Backend: Endpoint `/certification/reset`** (`backend/app/routers/billing.py`)

```python
@router.post("/certification/reset")
async def reset_certification(ctx: TenantContext = Depends(require_tenant)):
    company_id = ctx.organization.alanube_company_id
    if company_id:
        alanube_service = AlanubeService()
        try:
            logger.info(f"Resetting certification: Deleting company {company_id} from Alanube...")
            await alanube_service.delete_company(company_id)
        except Exception as e:
            logger.warning(f"Failed to delete company {company_id} from Alanube during reset: {e}")
    
    # Reset all certification fields (tax_id remains intact as it's immutable)
    ctx.organization.alanube_company_id = None
    ctx.organization.alanube_environment = None
    ctx.organization.certification_status = "none"
    ctx.organization.is_ecf_authorized = False
    ctx.organization.certificate_uploaded_at = None
    db.add(ctx.organization)
    db.commit()
    
    return {"status": "none"}
```

### 2. **Frontend: Button y Handler** (`frontend/components/billing/certification-wizard.tsx`)

- Se agregó un botón "Cancelar y Reiniciar" en los pasos 2 y 3 del wizard
- Incluye confirmación con `window.confirm()` para evitar clicks accidentales
- Handler `handleResetCertification` limpia todos los estados locales

```tsx
const handleResetCertification = async () => {
  if (!window.confirm("¿Estás seguro de que deseas cancelar el proceso...?")) {
    return;
  }
  setLoading(true);
  try {
    await billingApi.resetCertification();
    toast.success("Certificación reiniciada correctamente.");
    // Reset all form states
    setStep(1);
    setRnc("");
    // ... etc
  } catch (error) {
    logger.error("Error resetting certification:", error);
    toast.error("Error al reiniciar la certificación");
  }
};
```

### 3. **Frontend API Client** (`frontend/lib/api/billing.ts`)

```tsx
resetCertification: () =>
  apiFetch<{ message: string; status: string }>("/api/billing/certification/reset", {
    method: "POST",
  }),
```

## Flujo de Funcionamiento

1. **Usuario en paso 2 o 3:** Ve el botón "Cancelar y Reiniciar"
2. **Confirmación:** Se le pide confirmar la acción
3. **Backend limpia Alanube:** Se intenta eliminar la empresa del sandbox
4. **BD se resetea:** Se borran `alanube_company_id`, `alanube_environment`, etc., pero `tax_id` se mantiene
5. **UI se limpia:** Todos los campos del wizard se vacían, volviendo a step 1

## Decisiones Importantes

- **tax_id es inmutable:** No se borra en el reset porque es un identificador único de la organización
- **Try-catch en delete:** Si falla la eliminación en Alanube, la BD igual se resetea (mejor UX)
- **Confirmación JS:** `window.confirm()` protege contra clicks accidentales
- **Test con org separada:** Se crea una org nueva en el test para evitar contaminación de fixtures

## Testing

Se agregó `test_billing_ecf_certification_reset` que verifica:
- El endpoint responde 200 OK
- El servicio Alanube es llamado con el ID correcto
- La BD se actualiza correctamente (tax_id permanece, otros campos se limpian)

Todos los 5 tests de billing.py pasan exitosamente.

## Resultado

✅ Usuarios pueden limpiar registros incompletos de Alanube
✅ Reinicia el proceso de certificación desde el principio
✅ No hay contaminación del sandbox con empresas "fantasma"
✅ UX clara y confirmada con mensajes toast
