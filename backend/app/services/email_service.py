import logging
from datetime import datetime

from app.config import EMAIL_FROM, BILLING_EMAIL_FROM, BANK_NAME, BANK_ACCOUNT_HOLDER, BANK_ACCOUNT_NUMBER
from app.services.email_sender import EmailSender, ResendEmailSender

logger = logging.getLogger(__name__)

_sender: EmailSender = ResendEmailSender()


def configure_email_service(sender: EmailSender) -> None:
    global _sender
    _sender = sender


def _log_email_locally(to_email: str, subject: str, code: str = None, link: str = None):
    try:
        log_path = "/home/yvniel/Projects/web/fintral/sent_emails.log"
        now = datetime.now().isoformat()
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"=== EMAIL SENT ({now}) ===\n")
            f.write(f"To: {to_email}\n")
            f.write(f"Subject: {subject}\n")
            if code:
                f.write(f"Code: {code}\n")
            if link:
                f.write(f"Link: {link}\n")
            f.write("=========================\n\n")
        logger.info("Logged sent email locally to sent_emails.log: to=%s, subject=%s", to_email, subject)
    except Exception as e:
        logger.error("Failed to log email locally: %s", e)


def _verification_html(full_name: str, code: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:32px 16px">
<tr><td align="center">
  <table width="480" cellpadding="0" cellspacing="0" style="background:#111113;border-radius:20px;overflow:hidden;border:1px solid #1e1e20;max-width:100%">

    <!-- header -->
    <tr>
      <td style="padding:40px 40px 0" align="center">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <!-- logo bars -->
            <td style="padding-right:10px;vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr><td><div style="width:18px;height:3px;border-radius:2px;background:#38bdf8;margin-bottom:4px"></div></td></tr>
                <tr><td><div style="width:13px;height:3px;border-radius:2px;background:#7dd3fc;margin-bottom:4px"></div></td></tr>
                <tr><td><div style="width:8px;height:3px;border-radius:2px;background:#bae6fd"></div></td></tr>
              </table>
            </td>
            <td style="vertical-align:middle">
              <span style="font-size:20px;font-weight:600;color:#e4e4e7;letter-spacing:-0.3px">Fintral</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- body -->
    <tr>
      <td style="padding:32px 40px 28px" align="left">
        <h1 style="color:#fafafa;font-size:22px;font-weight:600;margin:0 0 16px;letter-spacing:-0.3px">Verifica tu cuenta</h1>
        <p style="color:#a1a1aa;margin:0 0 6px">Hola <strong style="color:#e4e4e7">{full_name or "usuario"}</strong>,</p>
        <p style="color:#a1a1aa;margin:0 0 28px">Usa este código para activar tu cuenta en Fintral y empezar a gestionar tus facturas.</p>

        <!-- code card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1a1a1d,#141416);border-radius:14px;border:1px solid #252528;margin-bottom:24px">
          <tr><td align="center" style="padding:24px 20px 20px">
            <p style="color:#71717a;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 14px">Código de verificación</p>
            <p class="code" style="color:#fafafa;font-size:34px;font-weight:700;letter-spacing:10px;margin:0;font-family:'SF Mono',Consolas,'Liberation Mono',monospace;background:#1e1e20;border-radius:10px;padding:16px 20px;display:inline-block">{code}</p>
          </td></tr>
        </table>

        <p style="color:#52525b;font-size:13px;line-height:1.6;margin:0">Este código expira en <strong style="color:#71717a">48 horas</strong>. Si no solicitaste esta verificación, ignora este mensaje.</p>
      </td>
    </tr>

    <!-- footer -->
    <tr>
      <td style="background:#0a0a0b;padding:18px 40px;border-top:1px solid #1a1a1c">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="left" style="vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:6px"><div style="width:12px;height:2px;border-radius:1px;background:#38bdf8;margin-bottom:2.5px"></div></td>
                  <td style="padding-right:6px"><div style="width:9px;height:2px;border-radius:1px;background:#7dd3fc;margin-bottom:2.5px"></div></td>
                  <td style="padding-right:6px"><div style="width:5px;height:2px;border-radius:1px;background:#bae6fd"></div></td>
                </tr>
              </table>
            </td>
            <td align="right" style="vertical-align:middle">
              <span style="color:#3f3f46;font-size:12px">Procesamiento de facturas con IA</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>
  <!-- disclaimer -->
  <p style="color:#27272a;font-size:11px;margin:16px 0 0;text-align:center">Fintral &mdash; Santo Domingo, República Dominicana</p>
</td></tr></table>
</body>
</html>"""


def _reset_password_html(full_name: str, code: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:32px 16px">
<tr><td align="center">
  <table width="480" cellpadding="0" cellspacing="0" style="background:#111113;border-radius:20px;overflow:hidden;border:1px solid #1e1e20;max-width:100%">
    <tr>
      <td style="padding:40px 40px 0" align="center">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:10px;vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr><td><div style="width:18px;height:3px;border-radius:2px;background:#38bdf8;margin-bottom:4px"></div></td></tr>
                <tr><td><div style="width:13px;height:3px;border-radius:2px;background:#7dd3fc;margin-bottom:4px"></div></td></tr>
                <tr><td><div style="width:8px;height:3px;border-radius:2px;background:#bae6fd"></div></td></tr>
              </table>
            </td>
            <td style="vertical-align:middle">
              <span style="font-size:20px;font-weight:600;color:#e4e4e7;letter-spacing:-0.3px">Fintral</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 28px" align="left">
        <h1 style="color:#fafafa;font-size:22px;font-weight:600;margin:0 0 16px;letter-spacing:-0.3px">Restablece tu contrase&ntilde;a</h1>
        <p style="color:#a1a1aa;margin:0 0 6px">Hola <strong style="color:#e4e4e7">{full_name or "usuario"}</strong>,</p>
        <p style="color:#a1a1aa;margin:0 0 28px">Recibimos una solicitud para restablecer la contrase&ntilde;a de tu cuenta en Fintral. Usa el siguiente c&oacute;digo para continuar.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1a1a1d,#141416);border-radius:14px;border:1px solid #252528;margin-bottom:24px">
          <tr><td align="center" style="padding:24px 20px 20px">
            <p style="color:#71717a;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 14px">C&oacute;digo de restablecimiento</p>
            <p class="code" style="color:#fafafa;font-size:34px;font-weight:700;letter-spacing:10px;margin:0;font-family:'SF Mono',Consolas,'Liberation Mono',monospace;background:#1e1e20;border-radius:10px;padding:16px 20px;display:inline-block">{code}</p>
          </td></tr>
        </table>
        <p style="color:#52525b;font-size:13px;line-height:1.6;margin:0">Este c&oacute;digo expira en <strong style="color:#71717a">48 horas</strong>. Si no solicitaste este cambio, ignora este mensaje.</p>
      </td>
    </tr>
    <tr>
      <td style="background:#0a0a0b;padding:18px 40px;border-top:1px solid #1a1a1c">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="left" style="vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:6px"><div style="width:12px;height:2px;border-radius:1px;background:#38bdf8;margin-bottom:2.5px"></div></td>
                  <td style="padding-right:6px"><div style="width:9px;height:2px;border-radius:1px;background:#7dd3fc;margin-bottom:2.5px"></div></td>
                  <td style="padding-right:6px"><div style="width:5px;height:2px;border-radius:1px;background:#bae6fd"></div></td>
                </tr>
              </table>
            </td>
            <td align="right" style="vertical-align:middle">
              <span style="color:#3f3f46;font-size:12px">Procesamiento de facturas con IA</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <p style="color:#27272a;font-size:11px;margin:16px 0 0;text-align:center">Fintral &mdash; Santo Domingo, Rep&uacute;blica Dominicana</p>
</td></tr></table>
</body>
</html>"""


def send_reset_password_email(email: str, full_name: str, code: str) -> bool:
    logger.info("Reset code for %s: %s", email, code)
    _log_email_locally(email, "Restablece tu contraseña en Fintral", code=code)
    html = _reset_password_html(full_name, code)
    result = _sender.send(EMAIL_FROM, [email], "Restablece tu contraseña en Fintral", html)
    return result is not None


def _password_changed_html(full_name: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:32px 16px">
<tr><td align="center">
  <table width="480" cellpadding="0" cellspacing="0" style="background:#111113;border-radius:20px;overflow:hidden;border:1px solid #1e1e20;max-width:100%">
    <tr>
      <td style="padding:40px 40px 0" align="center">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:10px;vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr><td><div style="width:18px;height:3px;border-radius:2px;background:#38bdf8;margin-bottom:4px"></div></td></tr>
                <tr><td><div style="width:13px;height:3px;border-radius:2px;background:#7dd3fc;margin-bottom:4px"></div></td></tr>
                <tr><td><div style="width:8px;height:3px;border-radius:2px;background:#bae6fd"></div></td></tr>
              </table>
            </td>
            <td style="vertical-align:middle">
              <span style="font-size:20px;font-weight:600;color:#e4e4e7;letter-spacing:-0.3px">Fintral</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 28px" align="left">
        <div style="margin-bottom:20px">
          <div style="width:48px;height:48px;border-radius:50%;background:#1a1a1d;border:1px solid #252528;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
        </div>
        <h1 style="color:#fafafa;font-size:22px;font-weight:600;margin:0 0 16px;text-align:center;letter-spacing:-0.3px">Contrase&ntilde;a actualizada</h1>
        <p style="color:#a1a1aa;margin:0 0 6px;text-align:center">Hola <strong style="color:#e4e4e7">{full_name or "usuario"}</strong>,</p>
        <p style="color:#a1a1aa;margin:0 0 8px;text-align:center">La contrase&ntilde;a de tu cuenta en Fintral ha sido cambiada correctamente.</p>
        <p style="color:#52525b;font-size:13px;line-height:1.6;margin:0;text-align:center">Si no realizaste este cambio, contacta a nuestro soporte de inmediato.</p>
      </td>
    </tr>
    <tr>
      <td style="background:#0a0a0b;padding:18px 40px;border-top:1px solid #1a1a1c">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="left" style="vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:6px"><div style="width:12px;height:2px;border-radius:1px;background:#38bdf8;margin-bottom:2.5px"></div></td>
                  <td style="padding-right:6px"><div style="width:9px;height:2px;border-radius:1px;background:#7dd3fc;margin-bottom:2.5px"></div></td>
                  <td style="padding-right:6px"><div style="width:5px;height:2px;border-radius:1px;background:#bae6fd"></div></td>
                </tr>
              </table>
            </td>
            <td align="right" style="vertical-align:middle">
              <span style="color:#3f3f46;font-size:12px">Procesamiento de facturas con IA</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <p style="color:#27272a;font-size:11px;margin:16px 0 0;text-align:center">Fintral &mdash; Santo Domingo, Rep&uacute;blica Dominicana</p>
</td></tr></table>
</body>
</html>"""


def send_password_changed_email(email: str, full_name: str) -> bool:
    logger.info("Password changed notification for %s", email)
    html = _password_changed_html(full_name)
    result = _sender.send(EMAIL_FROM, [email], "Tu contraseña de Fintral ha sido cambiada", html)
    return result is not None


def send_verification_email(email: str, full_name: str, code: str) -> bool:
    logger.info("Verification code for %s: %s", email, code)
    _log_email_locally(email, "Tu código de verificación en Fintral", code=code)
    html = _verification_html(full_name, code)
    result = _sender.send(EMAIL_FROM, [email], "Tu código de verificación en Fintral", html)
    return result is not None


def send_upload_link_email(email: str, org_name: str, link: str, expires_in_hours: int, max_files: int) -> bool:
    logger.info("Sending upload link email to %s, link: %s", email, link)
    _log_email_locally(email, "Enlace de subida de comprobantes en Fintral", link=link)
    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:32px 16px">
<tr><td align="center">
  <table width="480" cellpadding="0" cellspacing="0" style="background:#111113;border-radius:20px;overflow:hidden;border:1px solid #1e1e20;max-width:100%">
    <tr>
      <td style="padding:40px 40px 0" align="center">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:10px;vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr><td><div style="width:18px;height:3px;border-radius:2px;background:#38bdf8;margin-bottom:4px"></div></td></tr>
                <tr><td><div style="width:13px;height:3px;border-radius:2px;background:#7dd3fc;margin-bottom:4px"></div></td></tr>
                <tr><td><div style="width:8px;height:3px;border-radius:2px;background:#bae6fd"></div></td></tr>
              </table>
            </td>
            <td style="vertical-align:middle">
              <span style="font-size:20px;font-weight:600;color:#e4e4e7;letter-spacing:-0.3px">Fintral</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 28px" align="left">
        <h1 style="color:#fafafa;font-size:22px;font-weight:600;margin:0 0 16px;letter-spacing:-0.3px">Solicitud de Facturas</h1>
        <p style="color:#a1a1aa;margin:0 0 12px">Hola,</p>
        <p style="color:#a1a1aa;margin:0 0 20px">La organización <strong style="color:#e4e4e7">{org_name}</strong> te ha solicitado subir facturas o documentos contables a través del siguiente enlace temporal:</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
          <tr><td align="center">
            <a href="{link}" style="background:#533afd;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Subir Documentos</a>
          </td></tr>
        </table>

        <div style="background:#1a1a1d;border-radius:10px;border:1px solid #252528;padding:16px;margin-bottom:20px;color:#8e8e93;font-size:13px">
          <p style="margin:0 0 8px;color:#d1d1d6;font-weight:500">Detalles de la solicitud:</p>
          <ul style="margin:0;padding-left:20px;line-height:1.6">
            <li>Límite de archivos: <strong>{max_files} archivos</strong></li>
            <li>Duración del enlace: <strong>{expires_in_hours} horas</strong></li>
          </ul>
        </div>

        <p style="color:#52525b;font-size:13px;line-height:1.6;margin:0">Este enlace es seguro y no requiere inicio de sesión. Expirará automáticamente al cumplir el plazo o alcanzar el límite de archivos.</p>
      </td>
    </tr>
    <tr>
      <td style="background:#0a0a0b;padding:18px 40px;border-top:1px solid #1a1a1c">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="left" style="vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:6px"><div style="width:12px;height:2px;border-radius:1px;background:#38bdf8;margin-bottom:2.5px"></div></td>
                  <td style="padding-right:6px"><div style="width:9px;height:2px;border-radius:1px;background:#7dd3fc;margin-bottom:2.5px"></div></td>
                  <td style="padding-right:6px"><div style="width:5px;height:2px;border-radius:1px;background:#bae6fd"></div></td>
                </tr>
              </table>
            </td>
            <td align="right" style="vertical-align:middle">
              <span style="color:#3f3f46;font-size:12px">Portal de Carga Seguro</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <p style="color:#27272a;font-size:11px;margin:16px 0 0;text-align:center">Fintral &mdash; Santo Domingo, Rep&uacute;blica Dominicana</p>
</td></tr></table>
</body>
</html>"""

    result = _sender.send(EMAIL_FROM, [email], f"Carga de documentos solicitada por {org_name}", html)
    return result is not None


def _invitation_html(inviter_name: str, org_name: str, invite_link: str, role: str) -> str:
    role_labels = {"admin": "Administrador", "member": "Miembro", "viewer": "Observador", "owner": "Propietario"}
    role_label = role_labels.get(role, role)
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:32px 16px">
<tr><td align="center">
  <table width="480" cellpadding="0" cellspacing="0" style="background:#111113;border-radius:20px;overflow:hidden;border:1px solid #1e1e20;max-width:100%">

    <!-- header -->
    <tr>
      <td style="padding:40px 40px 0" align="center">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:10px;vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr><td><div style="width:18px;height:3px;border-radius:2px;background:#38bdf8;margin-bottom:4px"></div></td></tr>
                <tr><td><div style="width:13px;height:3px;border-radius:2px;background:#7dd3fc;margin-bottom:4px"></div></td></tr>
                <tr><td><div style="width:8px;height:3px;border-radius:2px;background:#bae6fd"></div></td></tr>
              </table>
            </td>
            <td style="vertical-align:middle">
              <span style="font-size:20px;font-weight:600;color:#e4e4e7;letter-spacing:-0.3px">Fintral</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- body -->
    <tr>
      <td style="padding:32px 40px 28px" align="left">
        <div style="margin-bottom:24px">
          <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#1a1a1d,#141416);border:1px solid #252528;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
        </div>
        <h1 style="color:#fafafa;font-size:22px;font-weight:600;margin:0 0 8px;text-align:center;letter-spacing:-0.3px">Has sido invitado</h1>
        <p style="color:#a1a1aa;margin:0 0 24px;text-align:center">{inviter_name} te ha invitado a unirte a <strong style="color:#e4e4e7">{org_name}</strong> en Fintral.</p>

        <!-- invite card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1a1a1d,#141416);border-radius:14px;border:1px solid #252528;margin-bottom:24px">
          <tr><td align="center" style="padding:20px">
            <table cellpadding="0" cellspacing="0" style="width:100%">
              <tr>
                <td style="text-align:center;padding-bottom:12px;border-bottom:1px solid #1e1e20">
                  <span style="color:#71717a;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:1px">Organización</span>
                  <p style="color:#fafafa;font-size:16px;font-weight:600;margin:6px 0 0">{org_name}</p>
                </td>
              </tr>
              <tr>
                <td style="text-align:center;padding-top:12px">
                  <span style="color:#71717a;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:1px">Tu rol</span>
                  <p style="color:#38bdf8;font-size:14px;font-weight:600;margin:6px 0 0">{role_label}</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- CTA button -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding:0 0 16px">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="background:#38bdf8;border-radius:12px;padding:0">
                    <a href="{invite_link}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#0a0a0b;text-decoration:none;border-radius:12px;background:#38bdf8">Aceptar invitación</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- fallback link -->
        <p style="color:#52525b;font-size:12px;line-height:1.6;margin:0;text-align:center;word-break:break-all">
          Si el botón no funciona, copia este enlace en tu navegador:<br>
          <a href="{invite_link}" style="color:#38bdf8;text-decoration:underline;font-size:11px">{invite_link}</a>
        </p>

        <p style="color:#52525b;font-size:13px;line-height:1.6;margin:16px 0 0;text-align:center">
          Este enlace expira en <strong style="color:#71717a">24 horas</strong>. Si no esperabas esta invitación, ignora este mensaje.
        </p>
      </td>
    </tr>

    <!-- footer -->
    <tr>
      <td style="background:#0a0a0b;padding:18px 40px;border-top:1px solid #1a1a1c">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="left" style="vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:6px"><div style="width:12px;height:2px;border-radius:1px;background:#38bdf8;margin-bottom:2.5px"></div></td>
                  <td style="padding-right:6px"><div style="width:9px;height:2px;border-radius:1px;background:#7dd3fc;margin-bottom:2.5px"></div></td>
                  <td style="padding-right:6px"><div style="width:5px;height:2px;border-radius:1px;background:#bae6fd"></div></td>
                </tr>
              </table>
            </td>
            <td align="right" style="vertical-align:middle">
              <span style="color:#3f3f46;font-size:12px">Procesamiento de facturas con IA</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

  </table>
  <p style="color:#27272a;font-size:11px;margin:16px 0 0;text-align:center">Fintral &mdash; Santo Domingo, Rep&uacute;blica Dominicana</p>
</td></tr></table>
</body>
</html>"""


def send_invitation_email(email: str, inviter_name: str, org_name: str, invite_link: str, role: str) -> bool:
    """Send an invitation email with a magic link to accept the invite."""
    logger.info("Invitation link for %s: %s", email, invite_link)
    _log_email_locally(email, f"Invitación a unirse a {org_name} en Fintral", link=invite_link)
    html = _invitation_html(inviter_name, org_name, invite_link, role)
    result = _sender.send(EMAIL_FROM, [email], f"{inviter_name} te ha invitado a {org_name} en Fintral", html)
    return result is not None


def send_tenant_suspension_email(email: str, tenant_name: str, reason: str, grace_days: int) -> bool:
    """Send a notification email to the user when their tenant is suspended."""
    logger.info("Sending suspension email to %s", email)

    # Simple, elegant dark HTML template consistent with Fintral branding
    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:32px 16px">
<tr><td align="center">
  <table width="480" cellpadding="0" cellspacing="0" style="background:#111113;border-radius:20px;overflow:hidden;border:1px solid #1e1e20;max-width:100%">
    <tr>
      <td style="padding:40px 40px 0" align="center">
        <span style="font-size:20px;font-weight:600;color:#e4e4e7;letter-spacing:-0.3px">Fintral</span>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 28px" align="left">
        <h1 style="color:#ef4444;font-size:22px;font-weight:600;margin:0 0 16px;letter-spacing:-0.3px">Cuenta Suspendida</h1>
        <p style="color:#a1a1aa;margin:0 0 16px">Estimado usuario de <strong>{tenant_name}</strong>,</p>
        <p style="color:#a1a1aa;margin:0 0 16px">Te informamos que tu cuenta en Fintral ha sido suspendida debido al siguiente motivo:</p>
        <blockquote style="margin: 0 0 20px; padding: 12px; background: #18181b; border-left: 4px solid #ef4444; color: #e4e4e7; border-radius: 4px;">
          {reason}
        </blockquote>
        {"<p style='color:#a1a1aa;margin:0 0 16px'>Tienes un período de gracia de <strong>" + str(grace_days) + " días</strong> para resolver este inconveniente antes de que el acceso a tus datos sea completamente bloqueado.</p>" if grace_days > 0 else ""}
        <p style="color:#a1a1aa;margin:0 0 16px">Si tienes alguna pregunta o crees que esto es un error, por favor ponte en contacto con soporte técnico.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 40px 40px" align="center">
        <p style="color:#27272a;font-size:11px;margin:16px 0 0;text-align:center">Fintral &mdash; Santo Domingo, República Dominicana</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>"""

    result = _sender.send(EMAIL_FROM, [email], f"Tu cuenta de Fintral ({tenant_name}) ha sido suspendida", html)
    return result is not None


def send_tenant_unsuspension_email(email: str, tenant_name: str) -> bool:
    """Send a notification email to the user when their tenant is unsuspended."""
    logger.info("Sending unsuspension email to %s", email)

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:32px 16px">
<tr><td align="center">
  <table width="480" cellpadding="0" cellspacing="0" style="background:#111113;border-radius:20px;overflow:hidden;border:1px solid #1e1e20;max-width:100%">
    <tr>
      <td style="padding:40px 40px 0" align="center">
        <span style="font-size:20px;font-weight:600;color:#e4e4e7;letter-spacing:-0.3px">Fintral</span>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 28px" align="left">
        <h1 style="color:#22c55e;font-size:22px;font-weight:600;margin:0 0 16px;letter-spacing:-0.3px">Cuenta Reactivada</h1>
        <p style="color:#a1a1aa;margin:0 0 16px">Estimado usuario de <strong>{tenant_name}</strong>,</p>
        <p style="color:#a1a1aa;margin:0 0 16px">Nos complace informarte que tu cuenta en Fintral ha sido reactivada exitosamente. Ya puedes acceder al sistema y continuar gestionando tus facturas normalmente.</p>
        <p style="color:#a1a1aa;margin:0 0 16px">Gracias por tu paciencia y por utilizar Fintral.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 40px 40px" align="center">
        <p style="color:#27272a;font-size:11px;margin:16px 0 0;text-align:center">Fintral &mdash; Santo Domingo, República Dominicana</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>"""

    result = _sender.send(EMAIL_FROM, [email], f"Tu cuenta de Fintral ({tenant_name}) ha sido reactivada", html)
    return result is not None


def send_admin_alert_email(email: str, title: str, message: str, severity: str, source: str, metadata: dict) -> bool:
    """Send an alert email to the administrator."""
    logger.info("Sending admin alert email to %s", email)
    metadata_html = ""
    if metadata:
        metadata_html = f"<div style='background:#18181b;padding:12px;border-radius:4px;border:1px solid #27272a;margin-top:12px;'><p style='color:#71717a;margin:0 0 8px;font-size:12px;font-weight:500;text-transform:uppercase;'>Metadatos:</p><pre style='color:#e4e4e7;margin:0;font-family:monospace;font-size:13px;white-space:pre-wrap;word-break:break-all;'>{metadata}</pre></div>"

    severity_color = "#ef4444" if severity.lower() == "error" else ("#f59e0b" if severity.lower() == "warning" else "#3b82f6")

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:32px 16px">
<tr><td align="center">
  <table width="480" cellpadding="0" cellspacing="0" style="background:#111113;border-radius:20px;overflow:hidden;border:1px solid #1e1e20;max-width:100%">
    <tr>
      <td style="padding:40px 40px 0" align="center">
        <span style="font-size:20px;font-weight:600;color:#e4e4e7;letter-spacing:-0.3px">Fintral Control Center</span>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 28px" align="left">
        <div style="display:inline-block;padding:4px 8px;border-radius:4px;background:{severity_color}22;color:{severity_color};font-size:12px;font-weight:600;text-transform:uppercase;margin-bottom:12px;border:1px solid {severity_color}44">
          {severity.upper()}
        </div>
        <h1 style="color:#fafafa;font-size:22px;font-weight:600;margin:0 0 16px;letter-spacing:-0.3px">{title}</h1>
        <p style="color:#a1a1aa;margin:0 0 16px">{message}</p>
        <p style="color:#a1a1aa;margin:0 0 8px"><strong>Origen:</strong> {source}</p>
        {metadata_html}
      </td>
    </tr>
    <tr>
      <td style="padding:0 40px 40px" align="center">
        <p style="color:#27272a;font-size:11px;margin:16px 0 0;text-align:center">Fintral &mdash; Centro de Operaciones</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>"""

    result = _sender.send(EMAIL_FROM, [email], f"Alerta Fintral [{severity.upper()}]: {title}", html)
    return result is not None


def send_purchase_invoice_email(
    customer_email: str,
    customer_name: str,
    items: list[dict],
    total: float,
    currency: str = "DOP",
    payment_method: str = "transfer",
    fee_amount: float = 0.0,
) -> bool:
    """Send purchase invoice to customer after payment confirmation."""
    invoice_number = f"FIN-{datetime.utcnow().strftime('%Y%m')}-{hash(customer_email) % 10000:04d}"
    invoice_date = datetime.utcnow().strftime("%d/%m/%Y")
    
    # Calculate subtotal based on items
    subtotal = sum(item.get("total", 0.0) for item in items)
    if subtotal <= 0.0:
        subtotal = total - fee_amount

    items_html = "".join(
        f"""<tr>
          <td style="padding:10px 12px;color:#1f2937;font-size:13px;border-bottom:1px solid #e5e7eb">{item.get("label", item.get("type", "Item"))}</td>
          <td style="padding:10px 12px;color:#1f2937;font-size:13px;border-bottom:1px solid #e5e7eb;text-align:center">{item.get("quantity", 1)}</td>
          <td style="padding:10px 12px;color:#1f2937;font-size:13px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace">{currency} {item.get("total", 0):.2f}</td>
        </tr>"""
        for item in items
    )

    if payment_method == "card":
        payment_method_html = """
        <p style="margin:0 0 4px;color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Método de pago</p>
        <p style="margin:0;color:#111827;font-size:14px;font-weight:600">Tarjeta de Crédito / Débito (MIO)</p>
        <p style="margin:0;color:#6b7280;font-size:13px">Transacción en línea procesada de forma segura.</p>
        """
    else:
        payment_method_html = f"""
        <p style="margin:0 0 4px;color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Método de pago</p>
        <p style="margin:0;color:#111827;font-size:14px;font-weight:600">Transferencia Bancaria</p>
        <p style="margin:0;color:#6b7280;font-size:13px">{BANK_NAME}<br>Titular: {BANK_ACCOUNT_HOLDER}<br>Cuenta: {BANK_ACCOUNT_NUMBER}</p>
        """

    totals_rows_html = f"""
    <tr>
      <td style="padding:8px 12px;color:#6b7280;font-size:13px">Subtotal</td>
      <td style="padding:8px 12px;color:#374151;font-size:13px;text-align:right;font-family:monospace">{currency} {subtotal:.2f}</td>
    </tr>
    """
    if fee_amount > 0.0:
        totals_rows_html += f"""
        <tr>
          <td style="padding:8px 12px;color:#6b7280;font-size:13px">Comisión de Procesamiento (5%)</td>
          <td style="padding:8px 12px;color:#374151;font-size:13px;text-align:right;font-family:monospace">{currency} {fee_amount:.2f}</td>
        </tr>
        """
    totals_rows_html += f"""
    <tr style="background:#f5f3ff">
      <td style="padding:12px;color:#533afd;font-size:15px;font-weight:700;border-radius:6px 0 0 6px">Total</td>
      <td style="padding:12px;color:#533afd;font-size:15px;font-weight:700;text-align:right;font-family:monospace;border-radius:0 6px 6px 0">{currency} {total:.2f}</td>
    </tr>
    """

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @media only screen and (max-width:600px) {{
      .invoice-table {{ width:100% !important; }}
      .invoice-inner {{ padding:24px 20px !important; }}
      .header-section {{ padding:32px 20px 0 !important; }}
      .footer-section {{ padding:0 20px 32px !important; }}
      .two-col td {{ display:block !important; width:100% !important; padding-bottom:16px !important; }}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#374151">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px">
<tr><td align="center">
  <table class="invoice-table" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04);max-width:100%">

    <!-- ─── HEADER ─── -->
    <tr>
      <td class="header-section" style="padding:40px 40px 0">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="top" width="50%">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:8px;vertical-align:middle">
                    <table cellpadding="0" cellspacing="0">
                      <tr><td><div style="width:16px;height:3px;border-radius:2px;background:#533afd;margin-bottom:3px"></div></td></tr>
                      <tr><td><div style="width:12px;height:3px;border-radius:2px;background:#7c6aff;margin-bottom:3px"></div></td></tr>
                      <tr><td><div style="width:8px;height:3px;border-radius:2px;background:#a5b4fc"></div></td></tr>
                    </table>
                  </td>
                  <td style="vertical-align:middle">
                    <span style="font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.5px">Fintral</span>
                  </td>
                </tr>
              </table>
              <p style="margin:6px 0 0;color:#6b7280;font-size:12px;line-height:1.5">
                <strong>Fintral</strong><br>
                facturacion@fintral.app<br>
                Santo Domingo, República Dominicana
              </p>
            </td>
            <td valign="top" width="50%" align="right">
              <h1 style="margin:0;color:#111827;font-size:28px;font-weight:700;letter-spacing:-0.5px">RECIBO</h1>
              <p style="margin:4px 0 0;color:#6b7280;font-size:12px;line-height:1.5">
                <strong>No. Referencia:</strong> {invoice_number}<br>
                <strong>Fecha:</strong> {invoice_date}<br>
                <strong>Vencimiento:</strong> {invoice_date}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ─── DIVIDER ─── -->
    <tr><td style="padding:0 40px"><div style="height:1px;background:#e5e7eb;margin:24px 0 0"></div></td></tr>

    <!-- ─── BILL TO / FROM ─── -->
    <tr>
      <td style="padding:24px 40px 0">
        <table class="two-col" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="top" width="50%">
              <p style="margin:0 0 4px;color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Facturar a</p>
              <p style="margin:0;color:#111827;font-size:14px;font-weight:600">{customer_name}</p>
              <p style="margin:0;color:#6b7280;font-size:13px">{customer_email}</p>
            </td>
            <td valign="top" width="50%">
              {payment_method_html}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ─── ITEMS TABLE ─── -->
    <tr>
      <td class="invoice-inner" style="padding:24px 40px 0">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:10px 12px;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;text-align:left;border-radius:6px 0 0 0">Producto</th>
              <th style="padding:10px 12px;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;text-align:center">Cant.</th>
              <th style="padding:10px 12px;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;text-align:right;border-radius:0 6px 0 0">Total</th>
            </tr>
          </thead>
          <tbody>
            {items_html}
          </tbody>
        </table>
      </td>
    </tr>

    <!-- ─── TOTALS ─── -->
    <tr>
      <td style="padding:0 40px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="50%"></td>
            <td width="50%">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
                {totals_rows_html}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ─── STATUS BADGE ─── -->
    <tr>
      <td style="padding:20px 40px 0" align="center">
        <table cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-radius:20px;padding:8px 20px;display:inline-block">
          <tr>
            <td style="color:#059669;font-size:13px;font-weight:600">PAGADA</td>
          </tr>
        </table>
        <p style="margin:6px 0 0;color:#6b7280;font-size:12px">
          Los productos adquiridos ya están activos en tu suscripción.
        </p>
      </td>
    </tr>

    <!-- ─── FOOTER ─── -->
    <tr>
      <td class="footer-section" style="padding:32px 40px 40px">
        <div style="height:1px;background:#e5e7eb;margin-bottom:20px"></div>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center">
              <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6">
                <strong style="color:#6b7280">Fintral</strong><br>
                Santo Domingo, República Dominicana &mdash; <a href="mailto:billing@fintral.app" style="color:#533afd;text-decoration:none">billing@fintral.app</a>
              </p>
              <p style="margin:8px 0 0;color:#d1d5db;font-size:10px">
                Esta factura fue generada automáticamente. Si tienes preguntas, responde a este correo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>"""

    result = _sender.send(
        BILLING_EMAIL_FROM,
        [customer_email],
        f"Factura FIN-{datetime.utcnow().strftime('%Y%m')}-{hash(customer_email) % 10000:04d} — Fintral",
        html,
        reply_to="billing@fintral.app",
    )
    return result is not None


def send_dunning_email(
    customer_email: str,
    customer_name: str,
    amount_dop: float,
    reason: str = "Pago declinado por el banco emisor.",
) -> bool:
    """Send payment failure email notification to customer (Dunning notice)."""
    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;max-width:100%">
    <!-- header -->
    <tr style="background:#dc2626;color:#ffffff">
      <td style="padding:24px;text-align:center">
        <h1 style="margin:0;font-size:20px;font-weight:600">Alerta de Pago Declinado</h1>
      </td>
    </tr>
    <!-- body -->
    <tr>
      <td style="padding:32px 40px" align="left">
        <p style="margin:0 0 16px;color:#111827">Hola <strong>{customer_name or "usuario"}</strong>,</p>
        <p style="color:#374151;margin:0 0 16px">No pudimos procesar la renovación de tu suscripción de <strong>Fintral Hub</strong> por valor de <strong>RD$ {amount_dop:.2f}</strong>.</p>
        <p style="color:#374151;margin:0 0 16px"><strong>Motivo:</strong> {reason}</p>
        
        <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin:24px 0">
          <p style="margin:0;color:#991b1b;font-size:14px">
            <strong>¿Qué sucede ahora?</strong><br>
            Reintentaremos el cobro automáticamente en 24 horas. Para evitar la suspensión de tu cuenta y seguir operando sin interrupción, por favor ingresa y actualiza tu tarjeta en la sección de configuración.
          </p>
        </div>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0">
          <tr><td align="center">
            <a href="https://app.fintral.com/dashboard/cuenta" style="background:#533afd;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:600;border-radius:8px;display:inline-block">Actualizar Método de Pago</a>
          </td></tr>
        </table>
      </td>
    </tr>
    <!-- footer -->
    <tr>
      <td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
        <p style="margin:0;color:#9ca3af;font-size:11px">Fintral SRL &bull; Santo Domingo, República Dominicana</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>"""

    result = _sender.send(BILLING_EMAIL_FROM, [customer_email], "Acción Requerida: Pago de suscripción declinado — Fintral", html, reply_to="billing@fintral.app")
    return result is not None


def send_payment_link_email(
    customer_email: str,
    customer_name: str,
    amount_dop: float,
    checkout_url: str,
) -> bool:
    """Send payment checkout link to customer when recurring payment token is missing."""
    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;max-width:100%">
    <!-- header -->
    <tr style="background:#533afd;color:#ffffff">
      <td style="padding:24px;text-align:center">
        <h1 style="margin:0;font-size:20px;font-weight:600">Renovación de Suscripción Fintral</h1>
      </td>
    </tr>
    <!-- body -->
    <tr>
      <td style="padding:32px 40px" align="left">
        <p style="margin:0 0 16px;color:#111827">Hola <strong>{customer_name or "usuario"}</strong>,</p>
        <p style="color:#374151;margin:0 0 16px">Es hora de renovar tu suscripción de <strong>Fintral Hub</strong> por valor de <strong>RD$ {amount_dop:.2f}</strong>.</p>
        <p style="color:#374151;margin:0 0 16px">Para continuar disfrutando de todas nuestras herramientas, procesa el pago de forma segura a través del siguiente enlace:</p>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0">
          <tr><td align="center">
            <a href="{checkout_url}" style="background:#0ea5e9;color:#ffffff;padding:14px 28px;text-decoration:none;font-weight:600;border-radius:8px;display:inline-block">Pagar Suscripción Ahora</a>
          </td></tr>
        </table>
        
        <p style="color:#6b7280;font-size:12px">Si tienes problemas con el botón, copia y pega este enlace en tu navegador:<br><a href="{checkout_url}" style="color:#0ea5e9">{checkout_url}</a></p>
      </td>
    </tr>
    <!-- footer -->
    <tr>
      <td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
        <p style="margin:0;color:#9ca3af;font-size:11px">Fintral SRL &bull; Santo Domingo, República Dominicana</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>"""

    result = _sender.send(BILLING_EMAIL_FROM, [customer_email], "Completa el pago de tu suscripción — Fintral", html, reply_to="billing@fintral.app")
    return result is not None


def send_renewal_reminder_email(
    customer_email: str,
    customer_name: str,
    plan_name: str,
    amount_dop: float,
    next_billing_date: str,
) -> bool:
    """Send renewal reminder email 3 days before the next billing date."""
    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;max-width:100%">
    <tr style="background:#0ea5e9;color:#ffffff">
      <td style="padding:24px;text-align:center">
        <h1 style="margin:0;font-size:20px;font-weight:600">Próxima Renovación de Fintral Hub</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px" align="left">
        <p style="margin:0 0 16px;color:#111827">Hola <strong>{customer_name or "usuario"}</strong>,</p>
        <p style="color:#374151;margin:0 0 16px">Te recordamos que tu suscripción a <strong>{plan_name}</strong> se renovará el <strong>{next_billing_date}</strong>.</p>
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:24px 0">
          <table width="100%" cellpadding="4" cellspacing="0">
            <tr><td style="color:#374151;font-size:14px">Plan</td><td align="right" style="font-weight:600">{plan_name}</td></tr>
            <tr><td style="color:#374151;font-size:14px">Monto</td><td align="right" style="font-weight:600">RD$ {amount_dop:.2f}</td></tr>
            <tr><td style="color:#374151;font-size:14px">Próximo cobro</td><td align="right" style="font-weight:600">{next_billing_date}</td></tr>
          </table>
        </div>
        <p style="color:#6b7280;font-size:13px">* Se aplica un cargo adicional del 5% por procesamiento de tarjeta en pagos con tarjeta de crédito/débito.</p>
        <p style="color:#6b7280;font-size:13px">Si deseas actualizar tu método de pago, ingresa a tu panel de configuración.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0">
          <tr><td align="center">
            <a href="https://app.fintral.com/dashboard/cuenta" style="background:#0ea5e9;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:600;border-radius:8px;display:inline-block">Ir a Mi Cuenta</a>
          </td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
        <p style="margin:0;color:#9ca3af;font-size:11px">Fintral SRL &bull; Santo Domingo, República Dominicana</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>"""

    result = _sender.send(BILLING_EMAIL_FROM, [customer_email], "Tu suscripción Fintral se renovará pronto", html, reply_to="billing@fintral.app")
    return result is not None


def send_trial_expired_email(customer_email: str, customer_name: str) -> bool:
    """Send notification when the user's free trial has ended."""
    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;max-width:100%">
    <tr style="background:#ea580c;color:#ffffff">
      <td style="padding:24px;text-align:center">
        <h1 style="margin:0;font-size:20px;font-weight:600">Tu Período de Prueba ha Finalizado</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px" align="left">
        <p style="margin:0 0 16px;color:#111827">Hola <strong>{customer_name or "usuario"}</strong>,</p>
        <p style="color:#374151;margin:0 0 16px">Tu período de prueba gratuito de Fintral Hub ha finalizado. Para seguir usando el Hub de Contabilidad, selecciona un plan y actualiza tu método de pago.</p>
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:24px 0">
          <p style="margin:0;color:#9a3412;font-size:14px">
            <strong>Acceso limitado:</strong> Aún puedes ver tus datos registrados, pero no podrás crear, editar ni emitir comprobantes hasta que reactives tu suscripción.
          </p>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0">
          <tr><td align="center">
            <a href="https://app.fintral.com/dashboard/tienda" style="background:#ea580c;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:600;border-radius:8px;display:inline-block">Elegir un Plan</a>
          </td></tr>
        </table>
        <p style="color:#6b7280;font-size:13px;margin:0">Fintral Factura sigue siendo 100% gratuito para emitir comprobantes fiscales.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
        <p style="margin:0;color:#9ca3af;font-size:11px">Fintral SRL &bull; Santo Domingo, República Dominicana</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>"""
    result = _sender.send(BILLING_EMAIL_FROM, [customer_email], "Tu período de prueba en Fintral ha terminado", html, reply_to="billing@fintral.app")
    return result is not None


def send_account_suspension_email(
    customer_email: str,
    customer_name: str,
    amount_dop: float,
) -> bool:
    """Send account suspension notification when grace period has expired."""
    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;max-width:100%">
    <tr style="background:#dc2626;color:#ffffff">
      <td style="padding:24px;text-align:center">
        <h1 style="margin:0;font-size:20px;font-weight:600">Cuenta Suspendida Temporalmente</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px" align="left">
        <p style="margin:0 0 16px;color:#111827">Hola <strong>{customer_name or "usuario"}</strong>,</p>
        <p style="color:#374151;margin:0 0 16px">Han transcurrido más de 3 días desde que intentamos procesar el pago de <strong>RD$ {amount_dop:.2f}</strong> y no hemos recibido el pago.</p>
        <p style="color:#374151;margin:0 0 16px">Como resultado, el acceso al <strong>Hub de Contabilidad de Fintral</strong> ha sido suspendido temporalmente.</p>
        <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin:24px 0">
          <p style="margin:0;color:#991b1b;font-size:14px">
            <strong>¿Cómo recuperar el acceso?</strong><br>
            Para reactivar tu cuenta, liquida los pagos pendientes desde tu panel de control. Una vez realizado, el acceso se restaurará automáticamente.
          </p>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0">
          <tr><td align="center">
            <a href="https://app.fintral.com/plans" style="background:#533afd;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:600;border-radius:8px;display:inline-block">Reactivar Suscripción</a>
          </td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
        <p style="margin:0;color:#9ca3af;font-size:11px">Fintral SRL &bull; Santo Domingo, República Dominicana</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>"""

    result = _sender.send(BILLING_EMAIL_FROM, [customer_email], "Tu acceso a Fintral Hub ha sido suspendido", html, reply_to="billing@fintral.app")
    return result is not None


def send_refund_request_email(
    admin_email: str,
    user_email: str,
    user_name: str,
    order_id: str,
    order_uuid: str,
    amount_cents: int,
    reference_number: str,
    reason: str,
    notes: str,
) -> bool:
    html = f"""
    <h3>Nueva Solicitud de Reembolso Recibida</h3>
    <p><strong>Usuario:</strong> {user_name} ({user_email})</p>
    <p><strong>ID Orden MIO:</strong> {order_id}</p>
    <p><strong>UUID Orden MIO:</strong> {order_uuid}</p>
    <p><strong>Monto:</strong> RD$ {amount_cents / 100.0:.2f}</p>
    <p><strong>Referencia MIO:</strong> {reference_number}</p>
    <p><strong>Motivo:</strong> {reason}</p>
    <p><strong>Notas:</strong> {notes or "Sin notas adicionales"}</p>
    <p>Por favor revise y procese este reembolso en la consola de MIO / GeoPagos.</p>
    """
    result = _sender.send(
        BILLING_EMAIL_FROM,
        [admin_email],
        f"Solicitud de Reembolso: {user_email}",
        html,
    )
    return result is not None


def send_payment_proof_received_email(
    customer_email: str,
    customer_name: str,
    amount: float,
    currency: str = "DOP",
) -> bool:
    """Send confirmation to customer after uploading a bank transfer proof."""
    subject = "Hemos recibido tu comprobante de pago"

    amount_str = f"{currency} {amount:,.2f}"

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#374151">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);max-width:100%">
    <tr>
      <td style="padding:40px 40px 0">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:8px;vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr><td><div style="width:16px;height:3px;border-radius:2px;background:#0EA5E9;margin-bottom:3px"></div></td></tr>
                <tr><td><div style="width:12px;height:3px;border-radius:2px;background:#38bdf8;margin-bottom:3px"></div></td></tr>
                <tr><td><div style="width:8px;height:3px;border-radius:2px;background:#7dd3fc"></div></td></tr>
              </table>
            </td>
            <td style="vertical-align:middle">
              <span style="font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.5px">Fintral</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 0">
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827">Comprobante recibido ✓</h1>
        <p style="margin:0 0 4px;color:#6b7280;font-size:15px">Hola <strong>{customer_name}</strong>,</p>
        <p style="margin:0 0 20px;color:#6b7280;font-size:15px">Hemos recibido tu comprobante de transferencia bancaria por <strong>{amount_str}</strong> de forma correcta.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 40px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd">
          <tr>
            <td style="padding:16px 20px">
              <p style="margin:0 0 8px;color:#0369a1;font-size:13px;font-weight:600">¿Qué sigue?</p>
              <p style="margin:0;color:#0c4a6e;font-size:13px">Nuestro equipo financiero revisará tu pago en las próximas 24 horas hábiles. Una vez verificado, recibirás un correo de confirmación y tus servicios serán activados automáticamente.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 40px 0;text-align:center">
        <p style="margin:0 0 4px;color:#9ca3af;font-size:12px">Si tienes alguna pregunta, responde a este correo o escríbenos a</p>
        <p style="margin:0;color:#0EA5E9;font-size:13px;font-weight:500">support@fintral.app</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 0">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-top:1px solid #e5e7eb;padding:20px 0;text-align:center">
              <p style="margin:0;color:#9ca3af;font-size:11px">© 2026 Fintral. Todos los derechos reservados.</p>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:11px">Santo Domingo, República Dominicana</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</td></tr></table></body></html>"""

    try:
        result = _sender.send(
            from_=BILLING_EMAIL_FROM,
            to=[customer_email],
            subject=subject,
            html=html,
            reply_to="billing@fintral.app",
        )
        success = result is not None
        if success:
            logger.info("Payment proof received email sent to %s", customer_email)
        else:
            logger.warning("Failed to send payment proof received email to %s", customer_email)
        return success
    except Exception as e:
        logger.error("Error sending payment proof received email to %s: %s", customer_email, e)
        return False


def send_payment_verified_email(
    customer_email: str,
    customer_name: str,
    amount: float,
    currency: str = "DOP",
    admin_notes: str | None = None,
) -> bool:
    """Notify customer their bank transfer payment has been verified."""
    subject = "✅ Pago verificado — Tus servicios ya están activos"

    amount_str = f"{currency} {amount:,.2f}"
    notes_html = ""
    if admin_notes:
        notes_html = f"""
        <tr>
          <td style="padding:0 40px">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border-radius:8px;border:1px solid #fde68a">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 4px;color:#92400e;font-size:12px;font-weight:600">Nota del administrador:</p>
                  <p style="margin:0;color:#78350f;font-size:13px">{admin_notes}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:8px"></td></tr>"""

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#374151">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);max-width:100%">
    <tr>
      <td style="padding:40px 40px 0">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:8px;vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr><td><div style="width:16px;height:3px;border-radius:2px;background:#0EA5E9;margin-bottom:3px"></div></td></tr>
                <tr><td><div style="width:12px;height:3px;border-radius:2px;background:#38bdf8;margin-bottom:3px"></div></td></tr>
                <tr><td><div style="width:8px;height:3px;border-radius:2px;background:#7dd3fc"></div></td></tr>
              </table>
            </td>
            <td style="vertical-align:middle">
              <span style="font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.5px">Fintral</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 0">
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#059669">Pago verificado ✓</h1>
        <p style="margin:0 0 4px;color:#6b7280;font-size:15px">Hola <strong>{customer_name}</strong>,</p>
        <p style="margin:0 0 20px;color:#6b7280;font-size:15px">Tu transferencia por <strong>{amount_str}</strong> ha sido verificada exitosamente. Todos tus servicios ya están activos.</p>
      </td>
    </tr>
    {notes_html}
    <tr>
      <td style="padding:0 40px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
          <tr>
            <td style="padding:16px 20px;text-align:center">
              <p style="margin:0;color:#166534;font-size:14px;font-weight:600">🎉 ¡Todo listo! Ya puedes disfrutar de tu plan.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 40px 0;text-align:center">
        <p style="margin:0 0 4px;color:#9ca3af;font-size:12px">Ingresa a tu cuenta para comenzar</p>
        <p style="margin:0;color:#0EA5E9;font-size:13px;font-weight:500">support@fintral.app</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 0">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-top:1px solid #e5e7eb;padding:20px 0;text-align:center">
              <p style="margin:0;color:#9ca3af;font-size:11px">© 2026 Fintral. Todos los derechos reservados.</p>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:11px">Santo Domingo, República Dominicana</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</td></tr></table></body></html>"""

    try:
        result = _sender.send(
            from_=BILLING_EMAIL_FROM,
            to=[customer_email],
            subject=subject,
            html=html,
            reply_to="billing@fintral.app",
        )
        success = result is not None
        if success:
            logger.info("Payment verified email sent to %s", customer_email)
        else:
            logger.warning("Failed to send payment verified email to %s", customer_email)
        return success
    except Exception as e:
        logger.error("Error sending payment verified email to %s: %s", customer_email, e)
        return False


def send_payment_rejected_email(
    customer_email: str,
    customer_name: str,
    amount: float,
    currency: str = "DOP",
    admin_notes: str | None = None,
) -> bool:
    """Notify customer their bank transfer payment has been rejected."""
    subject = "❌ Pago rechazado — Se requiere acción"

    amount_str = f"{currency} {amount:,.2f}"
    reason_html = ""
    if admin_notes:
        reason_html = f"""
        <tr>
          <td style="padding:0 40px">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;border:1px solid #fecaca">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 4px;color:#991b1b;font-size:12px;font-weight:600">Motivo del rechazo:</p>
                  <p style="margin:0;color:#7f1d1d;font-size:13px">{admin_notes}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:8px"></td></tr>"""

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#374151">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);max-width:100%">
    <tr>
      <td style="padding:40px 40px 0">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:8px;vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr><td><div style="width:16px;height:3px;border-radius:2px;background:#0EA5E9;margin-bottom:3px"></div></td></tr>
                <tr><td><div style="width:12px;height:3px;border-radius:2px;background:#38bdf8;margin-bottom:3px"></div></td></tr>
                <tr><td><div style="width:8px;height:3px;border-radius:2px;background:#7dd3fc"></div></td></tr>
              </table>
            </td>
            <td style="vertical-align:middle">
              <span style="font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.5px">Fintral</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 0">
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#dc2626">Pago rechazado ✕</h1>
        <p style="margin:0 0 4px;color:#6b7280;font-size:15px">Hola <strong>{customer_name}</strong>,</p>
        <p style="margin:0 0 20px;color:#6b7280;font-size:15px">Lamentablemente tu transferencia por <strong>{amount_str}</strong> no ha podido ser verificada.</p>
      </td>
    </tr>
    {reason_html}
    <tr>
      <td style="padding:0 40px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-radius:8px;border:1px solid #fed7aa">
          <tr>
            <td style="padding:16px 20px">
              <p style="margin:0 0 8px;color:#9a3412;font-size:13px;font-weight:600">Próximos pasos</p>
              <p style="margin:0;color:#7c2d12;font-size:13px">Puedes intentar realizar el pago nuevamente desde la tienda. Si crees que esto es un error, responde a este correo o contáctanos en <strong>support@fintral.app</strong>.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 40px 0;text-align:center">
        <p style="margin:0;color:#0EA5E9;font-size:13px;font-weight:500">support@fintral.app</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 0">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-top:1px solid #e5e7eb;padding:20px 0;text-align:center">
              <p style="margin:0;color:#9ca3af;font-size:11px">© 2026 Fintral. Todos los derechos reservados.</p>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:11px">Santo Domingo, República Dominicana</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</td></tr></table></body></html>"""

    try:
        result = _sender.send(
            from_=BILLING_EMAIL_FROM,
            to=[customer_email],
            subject=subject,
            html=html,
            reply_to="billing@fintral.app",
        )
        success = result is not None
        if success:
            logger.info("Payment rejected email sent to %s", customer_email)
        else:
            logger.warning("Failed to send payment rejected email to %s", customer_email)
        return success
    except Exception as e:
        logger.error("Error sending payment rejected email to %s: %s", customer_email, e)
        return False


def send_payment_revoked_email(
    customer_email: str,
    customer_name: str,
    amount: float,
    currency: str = "DOP",
    admin_notes: str | None = None,
) -> bool:
    """Notify customer that their verified payment has been revoked/refunded."""
    subject = "⚠️ Pago revocado / reembolsado — Fintral Hub"
    amount_str = f"{currency} {amount:,.2f}"
    
    reason_html = ""
    if admin_notes:
        reason_html = f"""
        <tr>
          <td style="padding:0 40px">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:8px;border:1px solid #fde68a">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 4px;color:#b45309;font-size:12px;font-weight:600">Comentarios del administrador:</p>
                  <p style="margin:0;color:#78350f;font-size:13px">{admin_notes}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:8px"></td></tr>"""

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#374151">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);max-width:100%">
    <tr>
      <td style="padding:40px 40px 0">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:8px;vertical-align:middle">
              <table cellpadding="0" cellspacing="0">
                <tr><td><div style="width:16px;height:3px;border-radius:2px;background:#0EA5E9;margin-bottom:3px"></div></td></tr>
                <tr><td><div style="width:12px;height:3px;border-radius:2px;background:#38bdf8;margin-bottom:3px"></div></td></tr>
                <tr><td><div style="width:8px;height:3px;border-radius:2px;background:#7dd3fc"></div></td></tr>
              </table>
            </td>
            <td style="vertical-align:middle">
              <span style="font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.5px">Fintral</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 0">
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#d97706">Pago revocado / reembolsado ⚠️</h1>
        <p style="margin:0 0 4px;color:#6b7280;font-size:15px">Hola <strong>{customer_name}</strong>,</p>
        <p style="margin:0 0 20px;color:#6b7280;font-size:15px">Te notificamos que el pago verificado por un monto de <strong>{amount_str}</strong> ha sido revocado en nuestro sistema.</p>
        <p style="margin:0 0 20px;color:#6b7280;font-size:15px">Tu plan e integraciones han sido revertidos al estado previo al pago. Si consideras que esto es un error o solicitaste un reembolso, tu saldo/suscripción se ha actualizado correspondientemente.</p>
      </td>
    </tr>
    {reason_html}
    <tr>
      <td style="padding:24px 40px 0;text-align:center">
        <p style="margin:0;color:#0EA5E9;font-size:13px;font-weight:500">support@fintral.app</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 40px 0">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-top:1px solid #e5e7eb;padding:20px 0;text-align:center">
              <p style="margin:0;color:#9ca3af;font-size:11px">© 2026 Fintral. Todos los derechos reservados.</p>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:11px">Santo Domingo, República Dominicana</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</td></tr></table></body></html>"""

    try:
        result = _sender.send(
            from_=BILLING_EMAIL_FROM,
            to=[customer_email],
            subject=subject,
            html=html,
            reply_to="support@fintral.app",
        )
        success = result is not None
        if success:
            logger.info("Payment revoked email sent to %s", customer_email)
        else:
            logger.warning("Failed to send payment revoked email to %s", customer_email)
        return success
    except Exception as e:
        logger.error("Error sending payment revoked email to %s: %s", customer_email, e)
        return False

