# Gemini Limits — Hallazgos

> Descubrimientos sobre límites que afectan a Gemini en el pipeline de procesamiento de facturas.

## Resumen

El sistema usa Gemini a través del `OpenAIInvoiceProcessor` (API REST directa sin SDK) cuando la API key empieza con `AIza`. El modelo configurado es `gemini-2.5-flash`.

## Hallazgos

### 1. Límite horario interno (100 req/hr) — aplica a Gemini en imágenes

**Archivo:** `backend/app/services/cost_control.py:44-69`  
**Archivo:** `backend/app/services/openai_processor.py:143-149`

`CostControlService.check_rate_limits()` se verifica **solo** en `process_image_invoice()`, **no** en `process_pdf_invoice()`. Es un contador en memoria que permite hasta 100 requests por hora móvil.

```python
if db and invoice:
    can_process = self.cost_control.can_process_request(db, org_id=org_id)
    if not can_process["allowed"]:
        error_msg = f"Límite excedido: {can_process['reason']}"
        return self._create_error_response(error_msg)
```

Si se excede, responde con: `"Límite excedido: hourly_limit_exceeded"`.

**Impacto:** Después de 100 imágenes procesadas en una hora, **ninguna factura imagen nueva se procesa**, ni siquiera por Gemini.

### 2. Sin registro de costos para Gemini

**Archivo:** `backend/app/services/openai_processor.py:299-308` (solo OpenAI)  
**Archivo:** `backend/app/services/cost_control.py:156-189`

`record_openai_usage()` solo se invoca desde el branch de OpenAI (`gpt-4o`, líneas 300-308). Gemini **nunca** registra:
- `Invoice.openai_tokens_used`
- `Invoice.openai_cost_usd`
- `Invoice.openai_model_used`

**Consecuencias:**
- El límite diario de $10 USD (`check_daily_cost_limit`, que suma `openai_cost_usd`) **no detiene a Gemini**
- No hay visibilidad de costos reales de Gemini en la DB
- El contador horario (`request_history`) aumenta pero nunca se asocia a un registro de uso

### 3. Sin reintentos (retry) para Gemini

**Archivo:** `backend/app/services/openai_processor.py:273-277` (imágenes)  
**Archivo:** `backend/app/services/openai_processor.py:870-874` (PDFs)

```python
resp = requests.post(url, json=payload, timeout=60.0)
if resp.status_code == 200:
    content = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
else:
    return self._create_error_response(f"Gemini API Error: {resp.text}")
```

Cualquier error HTTP no-200 falla inmediatamente sin reintento:
- `429` — rate limit de Google (free tier: 30 RPM, 1500 RPD)
- `403` — quota agotada / API key sin permisos
- `500` — error interno de Google
- `400` — request mal formado

La respuesta al usuario es genérica: `"Gemini API Error: {resp.text}"`.

### 4. `record_request_start()` incrementa contador pero no hay `record_openai_usage()` para Gemini

**Archivo:** `backend/app/services/openai_processor.py:159`

```python
start_time = self.cost_control.record_request_start()
```

Esto se ejecuta **antes** de cualquier branch (OpenAI, Gemini, Ollama), así que el contador horario sube con cada imagen procesada por Gemini. Pero como `record_openai_usage()` no se llama en el branch Gemini, el contador **nunca se descuenta** ni se limpia hasta que expiran los registros viejos (> 1 hora).

### 5. Timeout de 60s en Gemini

**Archivo:** `backend/app/services/openai_processor.py:273, 870`

```python
resp = requests.post(url, json=payload, timeout=60.0)
```

Timeout fijo de 60 segundos para Gemini, vs OpenAI que usa el default del SDK (sin timeout explícito). Para imágenes complejas o facturas con muchas líneas, 60s puede ser ajustado.

### 6. PDF path no verifica límites

**Archivo:** `backend/app/services/openai_processor.py:733-747`

`process_pdf_invoice()` no tiene:
- `can_process_request()` (sin límite horario)
- `record_request_start()` (no incrementa contador)
- Verificación de costos diarios

Esto significa que el procesamiento de PDFs no está limitado por ninguno de los controles internos.

### 7. `responseMimeType: "application/json"` — debería funcionar

**Archivo:** `backend/app/services/openai_processor.py:270-271, 866-867`

Gemini 2.5 Flash soporta `responseMimeType: "application/json"` para forzar salida JSON. No debería causar problemas. Si el modelo no lo soportara, devolvería un `400 Bad Request`.

## Posible causa raíz

El escenario más probable si el usuario no puede procesar: el **límite horario de 100 requests** se llenó procesando imágenes, y las nuevas fallan con `hourly_limit_exceeded`.

Alternativamente, Google está devolviendo `429 Too Many Requests` (rate limit) o `403` (quota diaria agotada en free tier), y como no hay retry, la factura falla de inmediato.
