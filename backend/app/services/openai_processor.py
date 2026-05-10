import openai
import os
import base64
import json
import time
from datetime import datetime
from PIL import Image
import PyPDF2
from io import BytesIO
from typing import Optional, Dict, Any, Tuple
from app.services.cost_control import CostControlService, OpenAICostInfo
from app.config import OPENAI_API_KEY, OLLAMA_HOST, OLLAMA_MODEL, GEMINI_API_URL, GEMINI_MODEL
from app.database import SessionLocal
from app.models import Invoice, Setting, UserSetting

class OpenAIInvoiceProcessor:
    def __init__(self):
        # Intentar cargar API Key desde BD, fallback a variable de entorno
        self.api_key = self._get_api_key()
        self.ollama_host = OLLAMA_HOST
        self.ollama_model = OLLAMA_MODEL
        
        if not self.api_key:
            self.client = None
            print("⚠️  API key not configured.")
        elif self.api_key.lower() in ("ollama", "local"):
            self.client = None
            print(f"✅ Ollama local LLM detected — using {self.ollama_model} at {self.ollama_host}")
        elif self.api_key.startswith("AIza"):
            self.client = None  # Gemini uses REST API, no OpenAI client needed
            print("✅ Gemini API key detected — using Google Gemini for processing")
        elif self.api_key.startswith("demo"):
            self.client = None
            print("⚠️  Demo API key detected.")
        else:
            try:
                self.client = openai.OpenAI(api_key=self.api_key)
                print("✅ OpenAI API key configured successfully")
            except Exception as e:
                self.client = None
                print(f"❌ Error configuring OpenAI API key: {e}")
        
        # Inicializar control de costos
        self.cost_control = CostControlService()
    
    def _get_api_key(self, org_id: Optional[int] = None, user_id: Optional[int] = None):
        """Resolución consistente: user override -> org setting -> env default."""
        api_key = None
        db = None
        try:
            db = SessionLocal()
            setting = None
            if user_id:
                setting = db.query(UserSetting).filter(
                    UserSetting.key == "openai_api_key",
                    UserSetting.user_id == user_id,
                ).first()

            if not setting and org_id:
                setting = db.query(Setting).filter(
                    Setting.key == "openai_api_key",
                    Setting.organization_id == org_id,
                ).first()

            if not setting:
                setting = db.query(Setting).filter(Setting.key == "openai_api_key").first()

            if setting and setting.value and len(setting.value) > 10:
                api_key = setting.value
        except Exception as e:
            print(f"⚠️ Error leyendo settings de BD: {e}")
        finally:
            if db:
                db.close()

        if not api_key:
            api_key = OPENAI_API_KEY

        return api_key

    def _get_client(self, org_id: Optional[int] = None, user_id: Optional[int] = None):
        """Crea un cliente de OpenAI con la API Key actual (BD o Env)"""
        api_key = self._get_api_key(org_id=org_id, user_id=user_id)
            
        if not api_key or api_key.startswith("demo"):
            return None
            
        try:
            return openai.OpenAI(api_key=api_key)
        except:
            return None

    def encode_image(self, image_path):
        """Codifica una imagen en base64 para enviar a OpenAI"""
        try:
            with Image.open(image_path) as img:
                # Convertir a RGB si es necesario
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                
                # Redimensionar si es muy grande (max 2000px lado mayor)
                max_size = 2000
                if max(img.size) > max_size:
                    ratio = max_size / max(img.size)
                    new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                    img = img.resize(new_size, Image.Resampling.LANCZOS)
                
                buffered = BytesIO()
                img.save(buffered, format="JPEG", quality=85)
                return base64.b64encode(buffered.getvalue()).decode('utf-8'), "jpeg"
        except Exception as e:
            print(f"Error encoding image: {e}")
            raise

    def extract_text_from_pdf(self, pdf_path):
        """Extrae texto de un archivo PDF"""
        text = ""
        try:
            with open(pdf_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                for page in reader.pages:
                    text += page.extract_text() + "\n"
            return text
        except Exception as e:
            print(f"Error extracting text from PDF: {e}")
            return ""

    def process_image_invoice(self, image_path, invoice=None, db=None, user_id: Optional[int] = None):
        """Procesa una factura en formato imagen usando GPT-4 Vision"""
        org_id = invoice.organization_id if invoice else None
        api_key = self._get_api_key(org_id=org_id, user_id=user_id)
        if not api_key:
            print("❌ API key missing - returning error")
            return {"error": "API key not configured. Please set it in Settings."}
        
        is_ollama = api_key.lower() in ("ollama", "local")
        is_gemini = api_key.startswith("AIza")
        if not is_gemini and not is_ollama:
            client = self._get_client(org_id=org_id, user_id=user_id)
            if not client:
                return {"error": "OpenAI client failed to initialize."}
        
        # Verificar límites antes de procesar
        if db and invoice:
            can_process = self.cost_control.can_process_request(db, org_id=org_id)
            if not can_process["allowed"]:
                error_msg = f"Límite excedido: {can_process['reason']}"
                print(f"🚫 {error_msg}")
                return self._create_error_response(error_msg)
        
        try:
            base64_image, image_format = self.encode_image(image_path)
            
            # Como siempre convertimos a JPEG, siempre usamos image/jpeg
            mime_type = 'image/jpeg'
            print(f"📤 Enviando imagen a OpenAI como: {mime_type}")
            
            # Registrar inicio de request para rate limiting
            start_time = self.cost_control.record_request_start()
            
            prompt = """
            Analiza esta imagen de factura y extrae la información clave. ADEMÁS, actúa como auditor contable y detecta anomalías.
            Devuelve la respuesta en formato JSON válido:

            {
                "vendor_name": "nombre del proveedor/empresa (null si no se encuentra)",
                "vendor_tax_id": "RNC del proveedor (9 dígitos; puede venir con guiones) (null si no se encuentra)",
                "vendor_fiscal_address": "dirección fiscal completa del proveedor (null si no se encuentra)",
                "invoice_number": "NCF / número de comprobante fiscal (null si no se encuentra)",
                "ncf_modified": "NCF o documento modificado si aplica (null si no se encuentra)",
                "goods_services_type": "tipo de bienes y servicios comprados (DGII 606) como código 01-11 (null si no se encuentra)",
                "invoice_date": "fecha en formato YYYY-MM-DD (null si no se encuentra)",
                "payment_date": "fecha de pago en formato YYYY-MM-DD (null si no se encuentra)",
                "total_amount": número_total_como_float (null si no se encuentra),
                "tax_amount": número_impuestos_como_float (null si no se encuentra),
                "services_amount": monto_servicios_sin_impuestos_como_float (null si no se encuentra),
                "goods_amount": monto_bienes_sin_impuestos_como_float (null si no se encuentra),
                "itbis_retenido": monto_itbis_retenido_como_float (null si no se encuentra),
                "itbis_proporcionalidad": monto_itbis_sujeto_a_proporcionalidad_como_float (null si no se encuentra),
                "itbis_llevado_costo": monto_itbis_llevado_al_costo_como_float (null si no se encuentra),
                "itbis_percibido": monto_itbis_percibido_en_compras_como_float (null si no se encuentra),
                "isr_retention_type": "tipo de retención ISR (1-9) si aplica (null si no se encuentra)",
                "isr_retention_amount": monto_retencion_isr_como_float (null si no se encuentra),
                "isr_percibido": monto_isr_percibido_en_compras_como_float (null si no se encuentra),
                "isc_amount": monto_impuesto_selectivo_consumo_como_float (null si no se encuentra),
                "other_taxes": monto_otros_impuestos_o_tasas_como_float (null si no se encuentra),
                "legal_tip": monto_propina_legal_como_float (null si no se encuentra),
                "payment_method": "forma de pago (1-7) o texto si aparece (null si no se encuentra)",
                "currency": "código de moneda como DOP, USD, EUR, etc. (null si no se encuentra)",
                "transaction_type": "expense para gastos o income para ingresos (null si no estás seguro)",
                "category": "categoría como oficina, viajes, comida, servicios, ventas, etc. (null si no estás seguro)",
                "description": "descripción breve de los productos/servicios (null si no se encuentra)",
                "line_items": [
                    {
                        "description": "descripción del producto/servicio",
                        "quantity": número_cantidad_como_float,
                        "unit_price": precio_unitario_como_float,
                        "subtotal": subtotal_como_float
                    }
                ],
                "confidence": número_del_0_al_1_indicando_confianza_en_la_extracción,
                "audit_warnings": ["lista", "de", "alertas", "en", "español"]
            }

            ENFOQUE REPÚBLICA DOMINICANA (impuestos y comprobantes):
            - Prioriza detectar RNC (9 dígitos, a veces con guiones) y NCF (comprobante fiscal, p. ej. B01, B02, E31, etc.).
            - Si identificas el NCF, conserva la estructura completa (letra + tipo + secuencia).
            - Identifica el ITBIS: busca palabras "ITBIS", "Impuesto" o líneas de impuestos. Si hay ITBIS explícito, úsalo como tax_amount.
            - Si hay propina legal (10%) o cargos de servicio, menciónalo en audit_warnings (no confundir con ITBIS).
            - Si el total está presente pero no el ITBIS y puedes inferirlo de líneas visibles, calcula tax_amount; si no, deja null.
            - Clasifica el "goods_services_type" (DGII 606) usando la descripción y líneas de productos/servicios. Usa códigos 01-11; si no estás seguro, deja null.
            - Códigos DGII 606 (01-11): 01 Gastos de personal, 02 Gastos por trabajos/suministros/servicios, 03 Arrendamientos, 04 Gastos de activos fijos, 05 Gastos de representación, 06 Otras deducciones admitidas, 07 Gastos financieros, 08 Gastos extraordinarios, 09 Compras/gastos costo de venta, 10 Adquisiciones de activos, 11 Gastos de seguros.
            - Forma de pago (DGII 606): 1 Efectivo, 2 Cheques/Transferencias/Depósito, 3 Tarjeta crédito/débito, 4 Compra a crédito, 5 Permuta, 6 Notas de crédito, 7 Mixto. Solo completa si es explícito.
            - Retenciones: solo completa retenciones/ISR/ITBIS retenido si el documento lo indica explícitamente.

            REGLAS DE LÍNEAS DE PRODUCTOS (line_items):
            - Extrae TODAS las líneas de productos/servicios visibles en la factura.
            - Si no hay líneas detalladas, usa la descripción general como una sola línea.
            - Los subtotales deben sumar al total_amount (excluyendo impuestos).
            - Si no hay líneas, retorna array vacío [].

            REGLAS DE AUDITORÍA (audit_warnings):
            - Si la imagen es borrosa o ilegible, añade "Documento poco legible".
            - Si faltan datos fiscales clave (RNC o dirección fiscal), añade "Faltan datos fiscales del proveedor".
            - Si falta NCF, añade "Falta NCF del proveedor".
            - Si el monto de ITBIS parece incorrecto (ej: >25% del total), añade "Posible error en ITBIS".
            - Si no se pudo identificar el tipo DGII 606, añade "Falta tipo de bienes y servicios (DGII 606)".
            - Si la fecha es muy antigua (> 3 meses), añade "Factura antigua".
            - Si detectas propinas o cargos no deducibles (alcohol, entretenimiento), menciónalo.
            - Si hay retenciones pero no hay fecha de pago, añade "Falta fecha de pago para retenciones".

            REGLAS GENERALES:
            - USA null para campos que no puedas identificar.
            - Los números deben ser float o null.
            - NO inventes datos.
            """
            
            if is_ollama:
                import requests as req
                print(f"🦙 Enviando imagen a Ollama ({self.ollama_model})...")
                ollama_url = f"{self.ollama_host}/api/chat"
                ollama_payload = {
                    "model": self.ollama_model,
                    "messages": [{
                        "role": "user",
                        "content": prompt + "\n\nResponde SOLO con JSON válido, sin texto adicional.",
                        "images": [base64_image]
                    }],
                    "stream": False,
                    "options": {"temperature": 0.1}
                }
                resp = req.post(ollama_url, json=ollama_payload, timeout=300.0)
                if resp.status_code == 200:
                    content = resp.json()["message"]["content"].strip()
                    print(f"✅ Ollama respondió ({len(content)} chars)")
                else:
                    return self._create_error_response(f"Ollama Error: {resp.text}")
            elif is_gemini:
                import requests
                url = f"{GEMINI_API_URL}/{GEMINI_MODEL}:generateContent?key={api_key}"
                payload = {
                    "contents": [{
                        "parts": [
                            {"text": prompt + "\n\nResponde estrictamente con JSON válido."},
                            {"inlineData": {"mimeType": mime_type, "data": base64_image}}
                        ]
                    }],
                    "generationConfig": {
                        "temperature": 0.1,
                        "responseMimeType": "application/json"
                    }
                }
                resp = requests.post(url, json=payload, timeout=60.0)
                if resp.status_code == 200:
                    content = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                else:
                    return self._create_error_response(f"Gemini API Error: {resp.text}")
            else:
                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{mime_type};base64,{base64_image}"
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens=2000,
                    temperature=0.1
                )
                
                # Registrar uso de tokens y costos
                if db and invoice and response.usage:
                    self.cost_control.record_openai_usage(
                        invoice=invoice,
                        model="gpt-4o",
                        input_tokens=response.usage.prompt_tokens,
                        output_tokens=response.usage.completion_tokens,
                        start_time=start_time,
                        db=db
                    )
                content = response.choices[0].message.content.strip()
            
            # Buscar JSON en la respuesta
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            
            if json_start == -1 or json_end == 0:
                raise ValueError("No se encontró JSON válido en la respuesta")
            
            json_str = content[json_start:json_end]
            extracted_data = json.loads(json_str)
            
            # Validar y limpiar datos
            return self._validate_and_clean_data(extracted_data)
            
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON from OpenAI response: {e}")
            return self._create_error_response("Error en formato de respuesta de OpenAI")
        except Exception as e:
            print(f"Error procesando imagen: {e}")
            return self._create_error_response(f"Error procesando imagen: {str(e)}")

    def _validate_country_code(self, value):
        """Valida códigos de país ISO 3166-1 alpha-3"""
        if value is None or value == "null":
            return None

        # Lista de países comunes (expandible según necesidad)
        valid_countries = ["USA", "MEX", "DOM", "COL", "ESP", "ARG", "CHL", "PER", "CAN", "BRA", "GBR", "FRA", "DEU", "ITA", "PRT", "CRI", "PAN", "URY", "ECU", "VEN", "BOL", "PRY"]
        country = str(value).upper().strip()

        # Validar que sea un código de 3 letras
        if len(country) == 3 and country.isalpha():
            return country if country in valid_countries else country  # Aceptar cualquier alpha-3

        return None

    def _infer_country_from_currency(self, currency):
        """Mapeo de moneda a país (fallback inteligente)"""
        currency_to_country = {
            "USD": "USA",
            "MXN": "MEX",
            "DOP": "DOM",
            "COP": "COL",
            "EUR": None,  # Ambiguo (múltiples países)
            "CLP": "CHL",
            "ARS": "ARG",
            "PEN": "PER",
            "CAD": "CAN",
            "BRL": "BRA",
            "GBP": "GBR",
            "CRC": "CRI",
            "PAB": "PAN",
            "UYU": "URY"
        }
        return currency_to_country.get(currency)

    def _infer_country_from_tax_id(self, tax_id):
        """
        Detecta país mediante patrones en identificador fiscal
        """
        import re

        if not tax_id:
            return None

        tax_id = str(tax_id).strip().upper()

        # Patrones de identificadores fiscales
        patterns = {
            "DOM": r"^\d{9}$|^\d{3}-\d{7}-\d{1}$",  # RNC dominicano: 9 dígitos o XXX-XXXXXXX-X
            "MEX": r"^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$",   # RFC mexicano: 13 caracteres
            "USA": r"^\d{2}-\d{7}$",                # EIN: XX-XXXXXXX
            "COL": r"^\d{9,10}$",                   # NIT colombiano: 9-10 dígitos
            "ESP": r"^[A-Z]\d{8}$|^\d{8}[A-Z]$",   # CIF/NIF español
            "ARG": r"^\d{2}-\d{8}-\d{1}$",          # CUIT argentino: XX-XXXXXXXX-X
        }

        for country, pattern in patterns.items():
            if re.match(pattern, tax_id):
                return country

        return None

    def _validate_line_items(self, items):
        """Valida y limpia líneas de productos"""
        if not isinstance(items, list):
            return []

        cleaned_items = []
        for item in items:
            if not isinstance(item, dict):
                continue

            cleaned_item = {
                "description": self._clean_string(item.get("description")),
                "quantity": self._clean_number(item.get("quantity")) or 1.0,
                "unit_price": self._clean_number(item.get("unit_price")) or 0.0,
                "subtotal": self._clean_number(item.get("subtotal")) or 0.0
            }

            # Validar que el subtotal sea consistente
            expected_subtotal = cleaned_item["quantity"] * cleaned_item["unit_price"]
            if abs(cleaned_item["subtotal"] - expected_subtotal) > 0.01:
                # Recalcular si hay inconsistencia
                cleaned_item["subtotal"] = expected_subtotal

            if cleaned_item["description"]:
                cleaned_items.append(cleaned_item)

        return cleaned_items

    def _smart_country_detection(self, extracted_data):
        """
        Combinación inteligente de múltiples señales para detectar país
        Retorna: (country_code, detection_method, confidence)
        """
        country = extracted_data.get("vendor_country")
        tax_id = extracted_data.get("vendor_tax_id")
        currency = extracted_data.get("currency")
        ai_confidence = extracted_data.get("confidence", 0.5)

        # 1. País explícito de IA (máxima prioridad)
        if country:
            validated_country = self._validate_country_code(country)
            if validated_country:
                return validated_country, "ai_extracted", ai_confidence

        # 2. Inferir de tax_id mediante patrones
        if tax_id:
            inferred = self._infer_country_from_tax_id(tax_id)
            if inferred:
                # Validar consistencia con moneda si existe
                if currency:
                    currency_country = self._infer_country_from_currency(currency)
                    if currency_country and currency_country != inferred:
                        # Conflicto: priorizar tax_id pero bajar confianza
                        if "audit_warnings" not in extracted_data:
                            extracted_data["audit_warnings"] = []
                        extracted_data["audit_warnings"].append(
                            f"Inconsistencia: tax_id sugiere {inferred}, moneda sugiere {currency_country}"
                        )
                        return inferred, "tax_id_pattern", 0.7

                return inferred, "tax_id_pattern", 0.8

        # 3. Fallback a moneda
        if currency:
            inferred = self._infer_country_from_currency(currency)
            if inferred:
                return inferred, "currency_fallback", 0.6

        # 4. No se pudo detectar
        return None, "undetected", 0.0

    def _validate_and_clean_data(self, data):
        """Valida y limpia los datos extraídos"""
        cleaned = {
            "vendor_name": self._clean_string(data.get("vendor_name")),
            "invoice_number": self._normalize_ncf(data.get("invoice_number")),
            "ncf_modified": self._normalize_ncf(data.get("ncf_modified")),
            "invoice_date": self._validate_date(data.get("invoice_date")),
            "payment_date": self._validate_date(data.get("payment_date")),
            "total_amount": self._clean_number(data.get("total_amount")),
            "tax_amount": self._clean_number(data.get("tax_amount")),
            "services_amount": self._clean_number(data.get("services_amount")),
            "goods_amount": self._clean_number(data.get("goods_amount")),
            "itbis_retenido": self._clean_number(data.get("itbis_retenido")),
            "itbis_proporcionalidad": self._clean_number(data.get("itbis_proporcionalidad")),
            "itbis_llevado_costo": self._clean_number(data.get("itbis_llevado_costo")),
            "itbis_percibido": self._clean_number(data.get("itbis_percibido")),
            "isr_retention_type": self._validate_isr_retention_type(data.get("isr_retention_type")),
            "isr_retention_amount": self._clean_number(data.get("isr_retention_amount")),
            "isr_percibido": self._clean_number(data.get("isr_percibido")),
            "isc_amount": self._clean_number(data.get("isc_amount")),
            "other_taxes": self._clean_number(data.get("other_taxes")),
            "legal_tip": self._clean_number(data.get("legal_tip")),
            "payment_method": self._validate_payment_method(data.get("payment_method")),
            "currency": self._clean_currency(data.get("currency")),
            "transaction_type": self._validate_transaction_type(data.get("transaction_type")),
            "category": self._clean_string(data.get("category")),
            "description": self._clean_string(data.get("description")),
            "confidence": self._clean_confidence(data.get("confidence", 0.5)),
            "audit_warnings": data.get("audit_warnings", []) if isinstance(data.get("audit_warnings"), list) else [],
            # Nuevos campos fiscales
            "vendor_tax_id": self._clean_string(data.get("vendor_tax_id")),
            "vendor_fiscal_address": self._clean_string(data.get("vendor_fiscal_address")),
            "line_items": self._validate_line_items(data.get("line_items", [])),
            "goods_services_type": self._validate_goods_services_type(data.get("goods_services_type"))
        }

        # Inferir tipo de bienes/servicios si no viene explícito
        if not cleaned["goods_services_type"]:
            cleaned["goods_services_type"] = self._infer_goods_services_type(cleaned)

        if not cleaned["goods_services_type"]:
            if "Falta tipo de bienes y servicios (DGII 606)" not in cleaned["audit_warnings"]:
                cleaned["audit_warnings"].append("Falta tipo de bienes y servicios (DGII 606)")

        if (cleaned.get("itbis_retenido") or cleaned.get("isr_retention_type") or cleaned.get("isr_retention_amount")) and not cleaned.get("payment_date"):
            if "Falta fecha de pago para retenciones" not in cleaned["audit_warnings"]:
                cleaned["audit_warnings"].append("Falta fecha de pago para retenciones")

        # Validación de NCF
        if cleaned["invoice_number"] and not self._is_valid_ncf(cleaned["invoice_number"]):
            if "NCF con formato inusual o incompleto" not in cleaned["audit_warnings"]:
                cleaned["audit_warnings"].append("NCF con formato inusual o incompleto")
        if cleaned["invoice_number"] and len(cleaned["invoice_number"]) >= 3:
            ncf_type = cleaned["invoice_number"][1:3]
            if ncf_type == "12" and "NCF tipo 12 no es válido para formato 606" not in cleaned["audit_warnings"]:
                cleaned["audit_warnings"].append("NCF tipo 12 no es válido para formato 606")

        # Si no se pudo extraer información crítica, usar valores por defecto inteligentes
        if not cleaned["vendor_name"]:
            cleaned["vendor_name"] = "Proveedor no identificado"

        if not cleaned["transaction_type"]:
            # Por defecto asumir gasto si no está claro
            cleaned["transaction_type"] = "expense"

        if not cleaned["category"]:
            cleaned["category"] = "sin_categoria"

        return cleaned
    
    def _clean_string(self, value):
        """Limpia y valida strings"""
        if value is None or value == "null" or str(value).strip() == "":
            return None
        return str(value).strip()
    
    def _clean_number(self, value):
        """Limpia y valida números"""
        if value is None or value == "null":
            return None
        try:
            # Remover caracteres no numéricos excepto punto y coma
            if isinstance(value, str):
                # Remover símbolos de moneda y espacios
                cleaned = value.replace("$", "").replace("€", "").replace("£", "").replace(",", "").strip()
                return float(cleaned) if cleaned else None
            return float(value)
        except (ValueError, TypeError):
            return None
    
    def _clean_currency(self, value):
        """Valida códigos de moneda"""
        if value is None or value == "null":
            return "DOP"  # Por defecto DOP (República Dominicana)
        
        # Lista de monedas comunes
        valid_currencies = ["DOP", "USD", "EUR", "MXN", "CAD", "GBP", "JPY", "CNY", "AUD", "CHF", "SEK", "NOK", "DKK"]
        currency = str(value).upper().strip()
        
        if currency in valid_currencies:
            return currency
        
        # Mapear algunos símbolos comunes
        currency_map = {"RD$": "DOP", "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY"}
        return currency_map.get(currency, "DOP")

    def _normalize_ncf(self, value):
        """Normaliza NCF a formato compacto (letras y números)"""
        import re
        if value is None or value == "null":
            return None
        ncf = str(value).upper().strip()
        ncf = re.sub(r'[^A-Z0-9]', '', ncf)
        return ncf if ncf else None

    def _is_valid_ncf(self, ncf: str) -> bool:
        """Valida formato común de NCF dominicano"""
        import re
        if not ncf:
            return True
        if re.match(r'^B\\d{2}\\d{8}$', ncf):
            return True
        if re.match(r'^E\\d{2}\\d{10}$', ncf):
            return True
        return False

    def _validate_goods_services_type(self, value):
        """Valida códigos DGII 606 (01-11)"""
        if value is None or value == "null":
            return None
        code = str(value).strip()
        if len(code) == 1:
            code = f"0{code}"
        valid = {f"{i:02d}" for i in range(1, 12)}
        return code if code in valid else None

    def _validate_isr_retention_type(self, value):
        """Valida tipo de retención ISR (1-9)"""
        if value is None or value == "null":
            return None
        raw = str(value).strip()
        if raw.isdigit():
            code = int(raw)
            return str(code) if 1 <= code <= 9 else None

        text = raw.lower()
        mapping = {
            "alquiler": "1",
            "honorario": "2",
            "servicio": "2",
            "otras rentas": "3",
            "rentas presuntas": "4",
            "intereses pagados a personas juridicas": "5",
            "intereses pagados a personas jurídicas": "5",
            "intereses pagados a personas fisicas": "6",
            "intereses pagados a personas físicas": "6",
            "proveedores del estado": "7",
            "juegos telefonicos": "8",
            "juegos telefónicos": "8",
            "ganaderia": "9",
            "ganadería": "9"
        }
        for key, code in mapping.items():
            if key in text:
                return code
        return None

    def _validate_payment_method(self, value):
        """Valida forma de pago DGII 606 (1-7)"""
        if value is None or value == "null":
            return None
        raw = str(value).strip()
        if raw.isdigit():
            code = int(raw)
            return str(code) if 1 <= code <= 7 else None

        text = raw.lower()
        if "efectivo" in text:
            return "1"
        if "cheque" in text or "transfer" in text or "depósito" in text or "deposito" in text:
            return "2"
        if "tarjeta" in text:
            return "3"
        if "crédito" in text or "credito" in text:
            return "4"
        if "permuta" in text:
            return "5"
        if "nota de crédito" in text or "nota de credito" in text:
            return "6"
        if "mixto" in text:
            return "7"
        return None

    def _infer_goods_services_type(self, cleaned):
        """Inferencia heurística de tipo DGII 606 a partir del texto"""
        text_parts = [cleaned.get("description") or "", cleaned.get("category") or ""]
        for item in cleaned.get("line_items", []):
            text_parts.append(item.get("description") or "")
        text = " ".join(text_parts).lower()

        def has_any(keys):
            return any(k in text for k in keys)

        if has_any(["nomina", "nómina", "salario", "sueld", "tss", "bono"]):
            return "01"
        if has_any(["arrend", "alquiler", "renta", "lease"]):
            return "03"
        if has_any(["seguro", "poliza", "póliza"]):
            return "11"
        if has_any(["financier", "interes", "interés", "banco", "comision bancaria", "comisión bancaria"]):
            return "07"
        if has_any(["representacion", "representación", "atenciones", "regalo"]):
            return "05"
        if has_any(["activo fijo", "maquinaria", "equipo", "vehiculo", "vehículo", "mobiliario", "computador", "laptop", "impresora", "adquisicion", "adquisición", "capital"]):
            return "10"
        if has_any(["inventario", "mercancia", "mercancía", "materia prima", "costo de venta", "costo de ventas", "compra de bienes"]):
            return "09"
        if has_any(["servicio", "consultoria", "consultoría", "mantenimiento", "publicidad", "internet", "telefonia", "telefonía", "energia", "energía", "luz", "agua", "transporte", "flete"]):
            return "02"
        return None
    
    def _validate_date(self, value):
        """Valida y formatea fechas"""
        if value is None or value == "null":
            return None
        try:
            # Intentar parsear diferentes formatos de fecha
            date_str = str(value).strip()
            for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"]:
                try:
                    parsed_date = datetime.strptime(date_str, fmt)
                    return parsed_date.strftime("%Y-%m-%d")
                except ValueError:
                    continue
            return None
        except:
            return None
    
    def _validate_transaction_type(self, value):
        """Valida el tipo de transacción"""
        if value is None or value == "null":
            return None
        
        value = str(value).lower().strip()
        if value in ["income", "ingreso", "venta", "factura_emitida"]:
            return "income"
        elif value in ["expense", "gasto", "compra", "factura_recibida"]:
            return "expense"
        return None
    
    def _clean_confidence(self, value):
        """Valida el score de confianza"""
        try:
            conf = float(value)
            return max(0.0, min(1.0, conf))  # Asegurar que esté entre 0 y 1
        except:
            return 0.5  # Valor por defecto
    
    def _create_error_response(self, error_msg):
        """Crea una respuesta de error con estructura consistente"""
        return {
            "error": error_msg,
            "vendor_name": "Error en procesamiento",
            "total_amount": None,
            "transaction_type": "expense",
            "category": "error",
            "confidence": 0.0
        }
    
    def process_pdf_invoice(self, pdf_path, invoice=None, db=None, user_id: Optional[int] = None):
        """Procesa una factura en formato PDF"""
        org_id = invoice.organization_id if invoice else None
        api_key = self._get_api_key(org_id=org_id, user_id=user_id)
        if not api_key:
            print("❌ API key missing - returning error")
            return {"error": "API key not configured. Please set it in Settings."}
        
        is_ollama = api_key.lower() in ("ollama", "local")
        is_gemini = api_key.startswith("AIza")
        if not is_gemini and not is_ollama:
            client = self._get_client(org_id=org_id, user_id=user_id)
            if not client:
                return {"error": "OpenAI client failed to initialize."}
        
        try:
            text = self.extract_text_from_pdf(pdf_path)
            
            if not text or len(text.strip()) < 10:
                return self._create_error_response("No se pudo extraer texto del PDF")
            
            # Limitar el texto para evitar tokens excesivos
            text = text[:4000]  # Limitar a ~4000 caracteres
            
            prompt = f"""
            Analiza este texto extraído de una factura PDF y extrae la información clave. ADEMÁS, actúa como auditor contable y detecta anomalías.
            Devuelve la respuesta en formato JSON válido:

            TEXTO DE LA FACTURA:
            {text}

            FORMATO DE RESPUESTA:
            {{
                "vendor_name": "nombre del proveedor/empresa (null si no se encuentra)",
                "vendor_tax_id": "RNC del proveedor (9 dígitos; puede venir con guiones) (null si no se encuentra)",
                "vendor_fiscal_address": "dirección fiscal completa del proveedor (null si no se encuentra)",
                "invoice_number": "NCF / número de comprobante fiscal (null si no se encuentra)",
                "ncf_modified": "NCF o documento modificado si aplica (null si no se encuentra)",
                "goods_services_type": "tipo de bienes y servicios comprados (DGII 606) como código 01-11 (null si no se encuentra)",
                "invoice_date": "fecha en formato YYYY-MM-DD (null si no se encuentra)",
                "payment_date": "fecha de pago en formato YYYY-MM-DD (null si no se encuentra)",
                "total_amount": número_total_como_float (null si no se encuentra),
                "tax_amount": número_impuestos_como_float (null si no se encuentra),
                "services_amount": monto_servicios_sin_impuestos_como_float (null si no se encuentra),
                "goods_amount": monto_bienes_sin_impuestos_como_float (null si no se encuentra),
                "itbis_retenido": monto_itbis_retenido_como_float (null si no se encuentra),
                "itbis_proporcionalidad": monto_itbis_sujeto_a_proporcionalidad_como_float (null si no se encuentra),
                "itbis_llevado_costo": monto_itbis_llevado_al_costo_como_float (null si no se encuentra),
                "itbis_percibido": monto_itbis_percibido_en_compras_como_float (null si no se encuentra),
                "isr_retention_type": "tipo de retención ISR (1-9) si aplica (null si no se encuentra)",
                "isr_retention_amount": monto_retencion_isr_como_float (null si no se encuentra),
                "isr_percibido": monto_isr_percibido_en_compras_como_float (null si no se encuentra),
                "isc_amount": monto_impuesto_selectivo_consumo_como_float (null si no se encuentra),
                "other_taxes": monto_otros_impuestos_o_tasas_como_float (null si no se encuentra),
                "legal_tip": monto_propina_legal_como_float (null si no se encuentra),
                "payment_method": "forma de pago (1-7) o texto si aparece (null si no se encuentra)",
                "currency": "código de moneda como DOP, USD, EUR, etc. (null si no se encuentra)",
                "transaction_type": "expense para gastos o income para ingresos (null si no estás seguro)",
                "category": "categoría como oficina, viajes, comida, servicios, ventas, etc. (null si no estás seguro)",
                "description": "descripción breve de los productos/servicios (null si no se encuentra)",
                "line_items": [
                    {{
                        "description": "descripción del producto/servicio",
                        "quantity": número_cantidad_como_float,
                        "unit_price": precio_unitario_como_float,
                        "subtotal": subtotal_como_float
                    }}
                ],
                "confidence": número_del_0_al_1_indicando_confianza_en_la_extracción,
                "audit_warnings": ["lista", "de", "alertas", "en", "español"]
            }}

            ENFOQUE REPÚBLICA DOMINICANA (impuestos y comprobantes):
            - Prioriza detectar RNC (9 dígitos, a veces con guiones) y NCF (comprobante fiscal, p. ej. B01, B02, E31, etc.).
            - Si identificas el NCF, conserva la estructura completa (letra + tipo + secuencia).
            - Identifica el ITBIS: busca "ITBIS", "Impuesto" o líneas de impuestos. Si hay ITBIS explícito, úsalo como tax_amount.
            - Si hay propina legal (10%) o cargos de servicio, menciónalo en audit_warnings (no confundir con ITBIS).
            - Si el total está presente pero no el ITBIS y puedes inferirlo de líneas visibles, calcula tax_amount; si no, deja null.
            - Clasifica el "goods_services_type" (DGII 606) usando la descripción y líneas de productos/servicios. Usa códigos 01-11; si no estás seguro, deja null.
            - Códigos DGII 606 (01-11): 01 Gastos de personal, 02 Gastos por trabajos/suministros/servicios, 03 Arrendamientos, 04 Gastos de activos fijos, 05 Gastos de representación, 06 Otras deducciones admitidas, 07 Gastos financieros, 08 Gastos extraordinarios, 09 Compras/gastos costo de venta, 10 Adquisiciones de activos, 11 Gastos de seguros.
            - Forma de pago (DGII 606): 1 Efectivo, 2 Cheques/Transferencias/Depósito, 3 Tarjeta crédito/débito, 4 Compra a crédito, 5 Permuta, 6 Notas de crédito, 7 Mixto. Solo completa si es explícito.
            - Retenciones: solo completa retenciones/ISR/ITBIS retenido si el documento lo indica explícitamente.

            REGLAS DE LÍNEAS DE PRODUCTOS (line_items):
            - Extrae TODAS las líneas de productos/servicios visibles.
            - Si no hay líneas detalladas, usa la descripción general como una sola línea.
            - Si no hay líneas, retorna array vacío [].

            REGLAS DE AUDITORÍA (audit_warnings):
            - Si faltan datos fiscales clave (RNC o dirección fiscal), añade "Faltan datos fiscales del proveedor".
            - Si falta NCF, añade "Falta NCF del proveedor".
            - Si el monto de ITBIS parece incorrecto (ej: >25% del total), añade "Posible error en ITBIS".
            - Si no se pudo identificar el tipo DGII 606, añade "Falta tipo de bienes y servicios (DGII 606)".
            - Si la fecha es muy antigua (> 3 meses), añade "Factura antigua".
            - Si detectas propinas o cargos no deducibles, menciónalo.
            - Si hay retenciones pero no hay fecha de pago, añade "Falta fecha de pago para retenciones".

            REGLAS GENERALES:
            - USA null para campos que no puedas identificar.
            - Los números deben ser float o null.
            - NO inventes datos.
            """

            if is_ollama:
                import requests as req
                print(f"🦙 Enviando PDF texto a Ollama ({self.ollama_model})...")
                ollama_url = f"{self.ollama_host}/api/chat"
                ollama_payload = {
                    "model": self.ollama_model,
                    "messages": [{
                        "role": "user",
                        "content": prompt + "\n\nResponde SOLO con JSON válido, sin texto adicional."
                    }],
                    "stream": False,
                    "options": {"temperature": 0.1}
                }
                resp = req.post(ollama_url, json=ollama_payload, timeout=300.0)
                if resp.status_code == 200:
                    content = resp.json()["message"]["content"].strip()
                    print(f"✅ Ollama respondió ({len(content)} chars)")
                else:
                    return self._create_error_response(f"Ollama Error: {resp.text}")
            elif is_gemini:
                import requests
                url = f"{GEMINI_API_URL}/{GEMINI_MODEL}:generateContent?key={api_key}"
                # Adjunta el texto procesado del PDF
                payload = {
                    "contents": [{
                        "parts": [
                            {"text": prompt + "\n\nResponde estrictamente con JSON válido."}
                        ]
                    }],
                    "generationConfig": {
                        "temperature": 0.1,
                        "responseMimeType": "application/json"
                    }
                }
                resp = requests.post(url, json=payload, timeout=60.0)
                if resp.status_code == 200:
                    content = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                else:
                    return self._create_error_response(f"Gemini API Error: {resp.text}")
            else:
                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=2000,
                    temperature=0.1
                )
                content = response.choices[0].message.content.strip()
            
            # Buscar JSON en la respuesta
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            
            if json_start == -1 or json_end == 0:
                raise ValueError("No se encontró JSON válido en la respuesta")
            
            json_str = content[json_start:json_end]
            extracted_data = json.loads(json_str)
            
            # Validar y limpiar datos
            return self._validate_and_clean_data(extracted_data)
            
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON from OpenAI response: {e}")
            return self._create_error_response("Error en formato de respuesta de OpenAI")
        except Exception as e:
            print(f"Error procesando PDF: {e}")
            return self._create_error_response(f"Error procesando PDF: {str(e)}")
    
    def process_invoice(self, file_path, file_type, invoice=None, db=None, user_id: Optional[int] = None):
        """Procesa una factura según su tipo"""
        if file_type == "image":
            return self.process_image_invoice(file_path, invoice, db, user_id=user_id)
        elif file_type == "pdf":
            return self.process_pdf_invoice(file_path, invoice, db, user_id=user_id)
        else:
            raise ValueError(f"Tipo de archivo no soportado: {file_type}")


    def process_finance_chat(self, query: str, context_data: list, org_id: Optional[int] = None, user_id: Optional[int] = None):
        """
        Procesa una pregunta en lenguaje natural sobre las finanzas.
        Recibe:
            - query: La pregunta del usuario (ej: "¿Cuánto gasté en Uber este mes?")
            - context_data: Lista de diccionarios con datos de facturas (resumidos)
        Retorna:
            - Respuesta en texto del asistente
        """
        client = self._get_client(org_id=org_id, user_id=user_id)
        if not client:
            return "Lo siento, la API Key de OpenAI no está configurada."

        try:
            # Preparar el contexto de datos (limitar tamaño si es necesario)
            # Convertir a JSON string para el prompt
            data_context = json.dumps(context_data, ensure_ascii=False)
            
            # Si el contexto es muy grande, deberíamos truncarlo, pero por ahora asumimos < 50-100 facturas
            # Un MVP seguro limita a las últimas 50 facturas relevantes
            
            system_prompt = """
            Eres el CFO (Chief Financial Officer) Inteligente de una empresa. 
            Tu trabajo es analizar los datos de facturas proporcionados y responder las preguntas del usuario de forma clara, concisa y profesional.
            
            DATOS DISPONIBLES (JSON):
            {data}
            
            REGLAS:
            1. Basa tus respuestas ÚNICAMENTE en los datos proporcionados. Si no tienes datos suficientes, dilo.
            2. Sé directo. Si preguntan "¿Cuánto gasté?", da la cifra exacta.
            3. Si detectas anomalías o gastos altos, menciónalos proactivamente (ej: "Nota: El gasto en AWS subió un 20%").
            4. Responde en el mismo idioma que la pregunta (detecta si es Español o Inglés).
            5. Usa formato Markdown para resaltar cifras (negrita) o listas.
            6. Si te preguntan por totales, suma los montos cuidadosamente.
            """.format(data=data_context)

            response = client.chat.completions.create(
                model="gpt-4o", # Modelo rápido y capaz
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": query}
                ],
                max_tokens=500,
                temperature=0.3 
            )

            return response.choices[0].message.content.strip()

        except Exception as e:
            print(f"Error en chat financiero: {e}")
            return "Lo siento, tuve un problema analizando tus datos. Intenta de nuevo más tarde." 
