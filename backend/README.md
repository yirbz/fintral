# 📊 InvoiceFlow Enterprise

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.9+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-00a393.svg)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4-412991.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
![Code Lines](https://img.shields.io/badge/code-6300%2B%20lines-orange.svg)

**Sistema SaaS empresarial para gestión inteligente de facturas con IA, analítica operativa en tiempo real y cumplimiento fiscal automático para República Dominicana.**

*Automatiza desde la captura hasta la exportación contable con procesamiento OCR avanzado y validación fiscal DGII.*

[Características](#-características-principales) • [Demo](#-demo-rápido) • [Instalación](#-instalación) • [Documentación](#-documentación) • [Contribuir](#-contribuir)

</div>

---

## 🎯 ¿Qué es InvoiceFlow?

InvoiceFlow es una plataforma completa de automatización contable diseñada específicamente para empresas en República Dominicana. Combina inteligencia artificial de OpenAI con validaciones fiscales locales (DGII) para transformar imágenes de facturas en datos estructurados listos para tu sistema contable.

### 💡 Problema que Resuelve

Las empresas pierden **decenas de horas al mes** digitando facturas manualmente, cometiendo errores de transcripción y luchando con el cumplimiento de la DGII. InvoiceFlow elimina ese trabajo manual con:

- **OCR Inteligente**: Extrae datos de facturas fotografiadas o escaneadas con >95% de precisión
- **Validación Fiscal Automática**: Verifica RNC, NCF, ITBIS y retenciones según normativa DGII
- **Integración WhatsApp**: Los empleados envían facturas por WhatsApp y el sistema las procesa automáticamente
- **Exportación Directa**: Genera archivos 606 para DGII y formatos para QuickBooks, Xero, Odoo, Contaplus

---

## ✨ Características Principales

### 🤖 Procesamiento con IA

- **Extracción Inteligente Multi-Campo**
  - Datos del proveedor (nombre, RNC, dirección)
  - Información fiscal (NCF, ITBIS, retenciones ISR)
  - Detalles financieros (subtotales, impuestos, totales, moneda)
  - Clasificación automática (ingreso/gasto, categoría contable)
  - Líneas de productos con descripción, cantidad, precio

- **Auditoría Automática de Calidad**
  - Alertas por datos faltantes o incompletos
  - Detección de ITBIS anómalo (fuera de 16% o 18%)
  - Validación de fechas (facturas antiguas >90 días)
  - Verificación de legibilidad de imagen
  - Score de confianza por campo extraído

- **Soporte Multi-Formato**
  - Imágenes: JPG, PNG, WEBP, HEIC
  - Documentos: PDF (extracción de texto + OCR)
  - Procesamiento por lotes

### 📱 Integración WhatsApp Business

- **Recepción Automática vía Evolution API**
  - Webhook para mensajes entrantes
  - Procesamiento automático de imágenes adjuntas
  - Respuestas automáticas con estado de procesamiento
  - Comandos de texto (/ayuda, /estado, /facturas)
  - Seguridad por número autorizado

- **Flujo de Trabajo Sin Fricción**
  1. Empleado fotografía factura y la envía por WhatsApp
  2. Sistema la procesa con IA en segundos
  3. Usuario recibe confirmación automática
  4. Datos disponibles en dashboard inmediatamente

### 🏢 Cumplimiento Fiscal República Dominicana (DGII)

- **Validación de Comprobantes**
  - RNC: formato 9 o 11 dígitos
  - NCF: serie completa (B01, B02, E31, etc.)
  - Tipo de NCF según operación

- **Cálculos Fiscales**
  - ITBIS desglosado (16% o 18%)
  - Retenciones ISR automáticas
  - Tipo de bien/servicio (códigos 01-11)
  - Forma de pago (efectivo, transferencia, tarjeta)

- **Exportación 606 DGII**
  - Formato oficial TXT para declaraciones mensuales
  - Validación de estructura antes de exportar
  - Filtros por período fiscal

### 📊 Dashboard y Analítica Operativa

- **Métricas en Tiempo Real**
  - Cola de facturas pendientes de procesar
  - Promedio de confianza de IA por factura
  - Alertas de auditoría activas
  - Costos de procesamiento OpenAI
  - Volumen histórico (facturas/día, semana, mes)

- **Estadísticas Detalladas**
  - Total de facturas procesadas
  - Desglose por proveedor
  - Análisis de gastos por categoría
  - Tendencias temporales

- **Notificaciones WebSocket**
  - Actualizaciones en tiempo real sin recargar página
  - Estado de procesamiento de facturas
  - Alertas de errores o límites alcanzados

### 💰 Control de Costos OpenAI

- **Límites Configurables**
  - Límite diario en USD
  - Límite de requests por hora
  - Alertas al alcanzar 80% y 100% del límite

- **Métricas Detalladas**
  - Costo acumulado por día/semana/mes
  - Desglose por modelo (GPT-4, GPT-4o, etc.)
  - Tokens consumidos (input/output)
  - Proyección de gasto mensual

### 📤 Exportación Multi-Formato

- **Formatos Contables Soportados**
  - **CSV**: Estándar para importación genérica
  - **DGII 606**: Formato oficial de compras
  - **QuickBooks**: Archivo Bills (IIF)
  - **Xero**: Formato CSV compatible
  - **Odoo**: Estructura de importación
  - **Contaplus**: Formato español adaptado
  - **JSON**: Para integraciones custom
  - **Excel**: XLSX con formato de plantilla

- **Características de Exportación**
  - Filtros por fecha, proveedor, categoría
  - Selección de columnas
  - Descarga directa o envío por email

### 🔐 Seguridad y Multi-Tenancy

- **Autenticación**
  - JWT tokens con refresh
  - Sesión por cookies HTTP-only
  - Passwords hasheados con bcrypt
  - Roles de usuario (admin, contable, usuario)

- **Organización Multi-Tenant**
  - Aislamiento de datos por organización
  - Configuraciones por organización
  - Usuarios asignados a organizaciones

### 🔔 Webhooks y Notificaciones

- **Webhooks Salientes**
  - Eventos: factura subida, procesada, error
  - Payload personalizable
  - Retries automáticos
  - Test de endpoints desde UI

- **Integración con Sistemas Externos**
  - Notificar a ERP al procesar factura
  - Sincronizar con sistema de aprobaciones
  - Trigger de workflows personalizados

### ⚡ Caché y Rendimiento

- **Redis para Optimización**
  - Caché de estadísticas (TTL 5 min)
  - Caché de configuraciones
  - Rate limiting por IP
  - Deduplicación de facturas (hash de imagen)

- **Rendimiento**
  - Procesamiento asíncrono de facturas
  - WebSockets para notificaciones en tiempo real
  - Compresión de imágenes antes de OCR

---

## 🏗️ Arquitectura Técnica

### Stack Tecnológico

```
Backend:       FastAPI + Uvicorn/Gunicorn
Base de Datos: PostgreSQL (Supabase en prod, Docker local)
Frontend:      Jinja2 Templates + TailwindCSS + Alpine.js
IA:            OpenAI GPT-4 Vision + GPT-4o
Integraciones: Evolution API (WhatsApp) + Webhooks
Cache:         Redis (stats, settings, rate limiting)
Despliegue:    Heroku / Docker / VPS
```

### Componentes Principales

```
main.py                    → FastAPI app, rutas HTTP/WebSocket, lógica de negocio
models.py                  → Modelos SQLAlchemy (Invoice, User, Organization, Settings)
openai_service.py          → Procesamiento IA, prompts, validaciones fiscales
whatsapp_service.py        → Webhook WhatsApp, procesamiento de mensajes
websocket_service.py       → Notificaciones en tiempo real
export_service.py          → Generación de archivos de exportación
cost_control_service.py    → Límites y métricas de OpenAI
redis_client.py            → Caché, rate limiting, deduplicación
auth.py                    → JWT, autenticación, sesiones
webhook_sender.py          → Envío de eventos externos
```

### Flujo de Procesamiento

```mermaid
graph LR
    A[Factura] -->|Upload Web/WhatsApp| B[Validación Formato]
    B --> C[Deduplicación Hash]
    C --> D[Comprimir Imagen]
    D --> E[OCR OpenAI GPT-4V]
    E --> F[Validación Fiscal DGII]
    F --> G[Auditoría Calidad]
    G --> H[Guardar BD]
    H --> I[Notificar WebSocket]
    H --> J[Webhook Externo]
    H --> K[Dashboard]
```

---

## 🚀 Demo Rápido

### Instalación en 3 Pasos

```bash
# 1. Clonar e instalar dependencias
git clone https://github.com/tu-usuario/invoiceflow.git
cd invoiceflow
python3 -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. Configurar variables de entorno
cp .env.example .env
nano .env  # Edita con tus credenciales

# 3. Iniciar aplicación
python check_db.py  # Inicializa BD
python main.py      # Inicia servidor
```

Abre `http://localhost:8000` y listo. 🎉

### Configuración Mínima (.env)

```bash
# Obligatorio
OPENAI_API_KEY=sk-tu-clave-aqui
SECRET_KEY=genera-un-string-aleatorio-largo

# Admin inicial (se crea automáticamente)
ADMIN_EMAIL=admin@tuempresa.com
ADMIN_PASSWORD=contraseña-segura-aqui

# Opcional - Producción
DATABASE_URL=postgresql://user:pass@host:5432/dbname
REDIS_URL=redis://localhost:6379/0
PORT=8000

# Opcional - WhatsApp
EVOLUTION_API_URL=https://tu-evolution-api.com
EVOLUTION_API_KEY=tu-api-key
EVOLUTION_INSTANCE_NAME=nombre-instancia
AUTHORIZED_WHATSAPP_NUMBER=18095551234
```

---

## 📖 Documentación

### Guías de Usuario

- **[Integración Evolution API](docs/EVOLUTION_API_INTEGRATION.md)** - Configurar WhatsApp Business
- **[Seguridad WhatsApp](docs/SEGURIDAD_WHATSAPP.md)** - Validaciones y mejores prácticas
- **[Guía de Imágenes](docs/whatsapp_image_guide.md)** - Optimizar calidad para OCR
- **[Deploy Heroku](docs/heroku-setup.md)** - Producción en Heroku
- **[Correcciones WebSocket](docs/CORRECCIONES_WEBSOCKET_ESTADISTICAS.md)** - Troubleshooting
- **[Mejoras Implementadas](docs/MEJORAS_IMPLEMENTADAS.md)** - Changelog detallado

### Endpoints API

#### Autenticación

```http
POST   /token              # Login (retorna JWT)
GET    /login              # Página de login
GET    /logout             # Cerrar sesión
```

#### Facturas

```http
POST   /upload                      # Subir factura (form-data)
POST   /process/{invoice_id}        # Procesar con IA
GET    /invoices                    # Lista de facturas (paginada)
GET    /invoices/{id}               # Detalle de factura
PUT    /invoices/{id}               # Actualizar factura
DELETE /invoices/{id}               # Eliminar factura
```

#### Exportación

```http
POST   /api/invoices/export         # Exportar con filtros (JSON)
GET    /export/csv                  # CSV rápido
GET    /export/dgii606              # DGII 606 TXT
GET    /export/quickbooks           # QuickBooks IIF
```

#### Estadísticas y Webhooks

```http
GET    /statistics                  # Dashboard principal
GET    /api/statistics              # JSON para gráficas
POST   /api/webhooks                # Crear webhook
GET    /api/webhooks                # Lista webhooks
POST   /api/webhooks/{id}/test      # Probar webhook
```

#### WhatsApp (Evolution API)

```http
POST   /evolution/webhook           # Recibir mensajes
POST   /evolution/send-message      # Enviar mensaje
GET    /evolution/instance-status   # Estado instancia
```

#### WebSocket

```
WS     /ws                          # Notificaciones en tiempo real
```

---

## 💼 Casos de Uso Reales

### 1. Empresa de Construcción (50+ facturas/día)

**Problema:** Secretaria dedicaba 3 horas diarias digitando facturas de materiales.

**Solución:**
- Proveedores envían facturas por WhatsApp
- Sistema procesa automáticamente en 10 segundos/factura
- Contadora revisa en dashboard y exporta a QuickBooks
- **Ahorro: 15 horas/semana** (60 horas/mes)

### 2. Consultora de Servicios (20 facturas/día)

**Problema:** Errores frecuentes al digitar NCF y RNC, causando rechazos en DGII.

**Solución:**
- Validación automática de RNC y NCF
- Alertas de ITBIS anómalo
- Exportación 606 con validaciones
- **Reducción de errores: 95%**

### 3. E-commerce Multi-País (100+ facturas/día)

**Problema:** Múltiples monedas, diferentes proveedores, difícil consolidar.

**Solución:**
- Detección automática de moneda (DOP, USD, EUR)
- Clasificación por categoría de gasto
- Webhooks a ERP para aprobar pagos
- **Visibilidad en tiempo real del flujo de caja**

---

## 🛠️ Instalación Avanzada

### Requisitos

- Python 3.9+
- PostgreSQL 12+ (Supabase en prod, Docker en desarrollo)
- Redis 6+ (opcional, para caché)
- OpenAI API Key (GPT-4 Vision habilitado)
- Evolution API (opcional, para WhatsApp)

### Instalación Producción con Docker

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/invoiceflow.git
cd invoiceflow

# Crear .env con tus credenciales
cp .env.example .env

# Construir y ejecutar con Docker Compose
docker-compose up -d

# Ver logs
docker-compose logs -f app
```

### Deploy en Heroku

```bash
# Instalar Heroku CLI y login
heroku login

# Crear app
heroku create tu-app-invoiceflow

# Agregar addons
heroku addons:create heroku-postgresql:mini
heroku addons:create heroku-redis:mini

# Configurar variables
heroku config:set OPENAI_API_KEY=sk-tu-clave
heroku config:set SECRET_KEY=$(openssl rand -hex 32)
heroku config:set ADMIN_EMAIL=admin@tuempresa.com
heroku config:set ADMIN_PASSWORD=tu-password-seguro

# Deploy
git push heroku main

# Abrir app
heroku open
```

Más detalles en [docs/heroku-setup.md](docs/heroku-setup.md).

### Configuración de Producción

#### Variables de Entorno Completas

```bash
# Core (obligatorio)
OPENAI_API_KEY=sk-proj-...
SECRET_KEY=$(openssl rand -hex 32)
DATABASE_URL=postgresql://user:pass@host:5432/invoiceflow
REDIS_URL=redis://host:6379/0
PORT=8000

# Admin inicial
ADMIN_EMAIL=admin@empresa.com
ADMIN_PASSWORD=Password123!Segura

# Límites OpenAI
OPENAI_DAILY_LIMIT_USD=50.0
OPENAI_HOURLY_LIMIT_REQUESTS=200

# WhatsApp (opcional)
EVOLUTION_API_URL=https://api.evolution.com
EVOLUTION_API_KEY=ABC123...
EVOLUTION_INSTANCE_NAME=empresa_wa
EVOLUTION_INSTANCE_TOKEN=token123
AUTHORIZED_WHATSAPP_NUMBER=18095551234

# Webhooks (opcional)
DEFAULT_WEBHOOK_URL=https://tu-erp.com/webhook
WEBHOOK_SECRET=secret-para-firmar-payloads
```

#### Seguridad Checklist

- [ ] Cambiar `SECRET_KEY` por valor aleatorio de 64+ caracteres
- [ ] Cambiar `ADMIN_PASSWORD` inmediatamente después del primer login
- [ ] Usar HTTPS en producción (Heroku lo provee gratis)
- [ ] Configurar límites de OpenAI para evitar sobrecostos
- [ ] Restringir `AUTHORIZED_WHATSAPP_NUMBER` a números confiables
- [ ] Habilitar autenticación en Redis si es público
- [ ] Configurar backups automáticos de PostgreSQL
- [ ] Revisar logs regularmente para detectar anomalías

---

## 🧪 Testing

```bash
# Ejecutar todos los tests
pytest tests/

# Tests con cobertura
pytest --cov=. --cov-report=html tests/

# Test específico
pytest tests/test_websocket_connection.py -v

# Ver reporte de cobertura
open htmlcov/index.html
```

### Tests Disponibles

- `test_websocket_connection.py` - Conexiones WebSocket
- `test_websocket_fix.py` - Correcciones de WebSocket
- `test_evolution_fallback.py` - Fallback de Evolution API

---

## 🗺️ Roadmap

### ✅ Implementado (v1.0)

- [x] OCR con OpenAI GPT-4 Vision
- [x] Validación fiscal DGII (RNC, NCF, ITBIS)
- [x] Integración WhatsApp vía Evolution API
- [x] Dashboard con estadísticas en tiempo real
- [x] Exportación multi-formato (DGII 606, CSV, QuickBooks, etc.)
- [x] Control de costos OpenAI
- [x] Webhooks salientes
- [x] Caché Redis
- [x] Multi-tenancy básico

### 🚧 En Desarrollo (Q1 2026)

- [ ] API REST completa con documentación OpenAPI/Swagger
- [ ] Tests automatizados con 80%+ cobertura
- [ ] Dashboard mejorado con gráficas interactivas (Chart.js)
- [ ] Internacionalización (i18n) - inglés y español
- [ ] Roles y permisos granulares (admin, contable, auditor, usuario)

### 🔮 Futuras Características (Q2-Q3 2026)

- [ ] OCR avanzado con modelos custom fine-tuned
- [ ] Soporte para más países (México, Colombia, etc.)
- [ ] Integración con SAP, Oracle NetSuite
- [ ] Análisis predictivo con ML (detectar fraudes, anomalías)
- [ ] Aplicación móvil nativa (iOS/Android)
- [ ] Reconocimiento de recibos simples (no solo facturas)
- [ ] Flujo de aprobación de facturas (workflow)
- [ ] Chatbot de WhatsApp con comandos avanzados
- [ ] Exportación a formato XML para facturación electrónica

**¿Tienes sugerencias?** Abre un [issue](https://github.com/tu-usuario/invoiceflow/issues) con la etiqueta `enhancement`.

---

## 🤝 Contribuir

¡InvoiceFlow es open source y damos la bienvenida a contribuciones! Ya sea que quieras:

- 🐛 Reportar un bug
- 💡 Sugerir una característica
- 📝 Mejorar la documentación
- 🔧 Enviar código (pull request)
- ⭐ Dar una estrella al proyecto

### Proceso de Contribución

1. **Fork** el repositorio
2. **Crea una rama** desde `main`:
   ```bash
   git checkout -b feature/mi-caracteristica
   ```
3. **Realiza tus cambios** siguiendo el estilo del proyecto
4. **Escribe tests** para tu código
5. **Commit** con mensajes descriptivos:
   ```bash
   git commit -m "feat: añadir validación de RNC para personas físicas"
   ```
6. **Push** a tu fork:
   ```bash
   git push origin feature/mi-caracteristica
   ```
7. **Abre un Pull Request** con descripción detallada

### Guías de Estilo

- **Python**: PEP 8, type hints cuando sea posible
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, etc.)
- **Documentación**: Español para docs de usuario, inglés para comentarios de código

Para más detalles, consulta [CONTRIBUTING.md](CONTRIBUTING.md).

### Código de Conducta

Este proyecto se rige por nuestro [Código de Conducta](CODE_OF_CONDUCT.md). Al participar, aceptas cumplir con estas normas.

### Seguridad

Si encuentras una vulnerabilidad de seguridad, **NO** abras un issue público. Por favor, revisa nuestra [Política de Seguridad](SECURITY.md) para reportarla de manera responsable.

---

## 🌟 Comunidad y Soporte

- 📫 **Issues**: [GitHub Issues](https://github.com/tu-usuario/invoiceflow/issues) para bugs y sugerencias
- 💬 **Discusiones**: [GitHub Discussions](https://github.com/tu-usuario/invoiceflow/discussions) para preguntas
- 📧 **Email**: Para asuntos privados o de seguridad
- 🌐 **Website**: [eriktaveras.com](https://eriktaveras.com)

---

## 📜 Licencia

MIT License - ver [LICENSE](LICENSE) para detalles completos.

En resumen: puedes usar, modificar y distribuir este software libremente, incluso para uso comercial, siempre que incluyas el copyright original.

---

## 👨‍💻 Autor

<div align="center">

### Erik Taveras

**Backend Developer & CEO de Taveras Solutions LLC**

Especialista en automatización de negocios con Python, N8N y WhatsApp bots. Con más de 150 proyectos exitosos ayudando a empresas a automatizar sus operaciones y ahorrar cientos de horas mensuales.

[![Website](https://img.shields.io/badge/🌐-eriktaveras.com-blue)](https://eriktaveras.com)
[![Instagram](https://img.shields.io/badge/Instagram-@eriktaveras-E4405F?logo=instagram&logoColor=white)](https://instagram.com/eriktaveras)
[![TikTok](https://img.shields.io/badge/TikTok-@erik.py-000000?logo=tiktok&logoColor=white)](https://tiktok.com/@erik.py)
[![Udemy](https://img.shields.io/badge/Udemy-Instructor-EC5252?logo=udemy&logoColor=white)](https://www.udemy.com/user/erik-taveras-youtube/)
[![PayPal](https://img.shields.io/badge/PayPal-Donate-00457C?logo=paypal&logoColor=white)](https://www.paypal.com/donate/?hosted_button_id=6JGWVDRJFG6FY)

*"Automatizando el futuro, un bot a la vez"*

</div>

### 🏆 Contribuidores

Gracias a todos los que han contribuido a este proyecto:

<!-- ALL-CONTRIBUTORS-LIST:START -->
<!-- Se agregarán automáticamente los contribuidores -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

**¿Quieres aparecer aquí?** ¡Envía tu primer PR!

---

## 🙏 Reconocimientos

Este proyecto ha sido posible gracias a:

- **[FastAPI](https://fastapi.tiangolo.com/)** - Framework web moderno y rápido
- **[OpenAI](https://openai.com/)** - Modelos de IA para OCR y extracción
- **[Evolution API](https://evolution-api.com/)** - API de WhatsApp Business
- **[TailwindCSS](https://tailwindcss.com/)** - Framework CSS utility-first
- **[Alpine.js](https://alpinejs.dev/)** - JavaScript reactivo ligero

Inspirado en las necesidades reales de empresas dominicanas que luchan diariamente con la digitación manual de facturas y el cumplimiento fiscal.

---

## 📊 Estadísticas del Proyecto

- 📝 **6,300+ líneas** de código Python
- 🧪 **3 suites** de tests automatizados
- 📄 **9 templates** HTML responsivos
- 📚 **6 documentos** de guías técnicas
- 🎨 **TailwindCSS** con diseño moderno
- ⚡ **WebSockets** para tiempo real
- 🔒 **JWT + bcrypt** para seguridad

---

<div align="center">

## 💖 ¿Te resultó útil InvoiceFlow?

Si este proyecto te ahorra tiempo o te ayuda con tu negocio, considera:

⭐ **Darle una estrella** al repositorio

🐦 **Compartirlo** en redes sociales

☕ **[Invitarme un café](https://www.paypal.com/donate/?hosted_button_id=6JGWVDRJFG6FY)** vía PayPal

📣 **Mencionarlo** en tu blog o podcast

📱 **Sígueme en**: [Instagram @eriktaveras](https://instagram.com/eriktaveras) | [TikTok @erik.py](https://tiktok.com/@erik.py)

---

**Construido con ❤️ en República Dominicana para la comunidad open source global**

*InvoiceFlow - Automatiza tu contabilidad, enfócate en crecer tu negocio*

[⬆ Volver arriba](#-invoiceflow-enterprise)

</div>