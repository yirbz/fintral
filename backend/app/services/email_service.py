import logging
from datetime import datetime

import resend

from app.config import EMAIL_FROM, BILLING_EMAIL_FROM, RESEND_API_KEY, BANK_NAME, BANK_ACCOUNT_HOLDER, BANK_ACCOUNT_NUMBER

logger = logging.getLogger(__name__)


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
    if not RESEND_API_KEY:
        logger.warning("Resend not configured — skipping email to %s. Use code: %s", email, code)
        return False
    resend.api_key = RESEND_API_KEY
    html = _reset_password_html(full_name, code)
    try:
        response = resend.Emails.send({
            "from": EMAIL_FROM,
            "to": [email],
            "subject": "Restablece tu contraseña en Fintral",
            "html": html,
        })
        logger.info("Reset email sent to %s — id=%s", email, response.get("id"))
        return True
    except Exception as e:
        logger.warning("Failed to send reset email to %s: %s", email, e)
        return False


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
    if not RESEND_API_KEY:
        logger.warning("Resend not configured — skipping password changed email to %s", email)
        return False
    resend.api_key = RESEND_API_KEY
    html = _password_changed_html(full_name)
    try:
        response = resend.Emails.send({
            "from": EMAIL_FROM,
            "to": [email],
            "subject": "Tu contraseña de Fintral ha sido cambiada",
            "html": html,
        })
        logger.info("Password changed email sent to %s — id=%s", email, response.get("id"))
        return True
    except Exception as e:
        logger.warning("Failed to send password changed email to %s: %s", email, e)
        return False


def send_verification_email(email: str, full_name: str, code: str) -> bool:
    logger.info("Verification code for %s: %s", email, code)

    if not RESEND_API_KEY:
        logger.warning("Resend not configured — skipping email to %s. Use code: %s", email, code)
        return False

    resend.api_key = RESEND_API_KEY

    html = _verification_html(full_name, code)

    try:
        response = resend.Emails.send({
            "from": EMAIL_FROM,
            "to": [email],
            "subject": "Tu código de verificación en Fintral",
            "html": html,
        })
        logger.info("Verification email sent to %s — id=%s", email, response.get("id"))
        return True
    except Exception as e:
        logger.warning("Failed to send verification email to %s: %s", email, e)
        return False


def send_upload_link_email(email: str, org_name: str, link: str, expires_in_hours: int, max_files: int) -> bool:
    logger.info("Sending upload link email to %s, link: %s", email, link)
    if not RESEND_API_KEY:
        logger.warning("Resend not configured — skipping upload link email to %s. Link: %s", email, link)
        return False
    resend.api_key = RESEND_API_KEY
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

    try:
        response = resend.Emails.send({
            "from": EMAIL_FROM,
            "to": [email],
            "subject": f"Carga de documentos solicitada por {org_name}",
            "html": html,
        })
        logger.info("Upload link email sent to %s — id=%s", email, response.get("id"))
        return True
    except Exception as e:
        logger.warning("Failed to send upload link email to %s: %s", email, e)
        return False


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

    if not RESEND_API_KEY:
        logger.warning("Resend not configured — skipping invitation email to %s. Link: %s", email, invite_link)
        return False

    resend.api_key = RESEND_API_KEY
    html = _invitation_html(inviter_name, org_name, invite_link, role)

    try:
        response = resend.Emails.send({
            "from": EMAIL_FROM,
            "to": [email],
            "subject": f"{inviter_name} te ha invitado a {org_name} en Fintral",
            "html": html,
        })
        logger.info("Invitation email sent to %s — id=%s", email, response.get("id"))
        return True
    except Exception as e:
        logger.warning("Failed to send invitation email to %s: %s", email, e)
        return False


def send_tenant_suspension_email(email: str, tenant_name: str, reason: str, grace_days: int) -> bool:
    """Send a notification email to the user when their tenant is suspended."""
    logger.info("Sending suspension email to %s", email)
    if not RESEND_API_KEY:
        logger.warning("Resend not configured — skipping suspension email to %s.", email)
        return False

    resend.api_key = RESEND_API_KEY

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

    try:
        response = resend.Emails.send({
            "from": EMAIL_FROM,
            "to": [email],
            "subject": f"Tu cuenta de Fintral ({tenant_name}) ha sido suspendida",
            "html": html,
        })
        logger.info("Suspension email sent to %s — id=%s", email, response.get("id"))
        return True
    except Exception as e:
        logger.warning("Failed to send suspension email to %s: %s", email, e)
        return False


def send_tenant_unsuspension_email(email: str, tenant_name: str) -> bool:
    """Send a notification email to the user when their tenant is unsuspended."""
    logger.info("Sending unsuspension email to %s", email)
    if not RESEND_API_KEY:
        logger.warning("Resend not configured — skipping unsuspension email to %s.", email)
        return False

    resend.api_key = RESEND_API_KEY

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

    try:
        response = resend.Emails.send({
            "from": EMAIL_FROM,
            "to": [email],
            "subject": f"Tu cuenta de Fintral ({tenant_name}) ha sido reactivada",
            "html": html,
        })
        logger.info("Unsuspension email sent to %s — id=%s", email, response.get("id"))
        return True
    except Exception as e:
        logger.warning("Failed to send unsuspension email to %s: %s", email, e)
        return False


def send_admin_alert_email(email: str, title: str, message: str, severity: str, source: str, metadata: dict) -> bool:
    """Send an alert email to the administrator."""
    logger.info("Sending admin alert email to %s", email)
    if not RESEND_API_KEY:
        logger.warning("Resend not configured — skipping admin alert email to %s.", email)
        return False

    resend.api_key = RESEND_API_KEY

    # Format metadata as HTML list/pre
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

    try:
        response = resend.Emails.send({
            "from": EMAIL_FROM,
            "to": [email],
            "subject": f"Alerta Fintral [{severity.upper()}]: {title}",
            "html": html,
        })
        logger.info("Admin alert email sent to %s — id=%s", email, response.get("id"))
        return True
    except Exception as e:
        logger.warning("Failed to send admin alert email to %s: %s", email, e)
        return False


def send_purchase_invoice_email(customer_email: str, customer_name: str, items: list[dict], total: float, currency: str = "DOP") -> bool:
    """Send purchase invoice to customer after admin approves a payment proof."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping purchase invoice email to %s", customer_email)
        return False

    resend.api_key = RESEND_API_KEY

    invoice_number = f"FIN-{datetime.utcnow().strftime('%Y%m')}-{hash(customer_email) % 10000:04d}"
    invoice_date = datetime.utcnow().strftime("%d/%m/%Y")
    subtotal = total / 1.18
    itbis = total - subtotal

    items_html = "".join(
        f"""<tr>
          <td style="padding:10px 12px;color:#1f2937;font-size:13px;border-bottom:1px solid #e5e7eb">{item.get("label", item.get("type", "Item"))}</td>
          <td style="padding:10px 12px;color:#1f2937;font-size:13px;border-bottom:1px solid #e5e7eb;text-align:center">{item.get("quantity", 1)}</td>
          <td style="padding:10px 12px;color:#1f2937;font-size:13px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace">{currency} {item.get("total", 0):.2f}</td>
        </tr>"""
        for item in items
    )

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @@media only screen and (max-width:600px) {{
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
              <h1 style="margin:0;color:#111827;font-size:28px;font-weight:700;letter-spacing:-0.5px">FACTURA</h1>
              <p style="margin:4px 0 0;color:#6b7280;font-size:12px;line-height:1.5">
                <strong>No.</strong> {invoice_number}<br>
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
              <p style="margin:0 0 4px;color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Método de pago</p>
              <p style="margin:0;color:#111827;font-size:13px;font-weight:600">Transferencia Bancaria</p>
              <p style="margin:0;color:#6b7280;font-size:12px">{BANK_NAME}<br>Titular: {BANK_ACCOUNT_HOLDER}<br>Cuenta: {BANK_ACCOUNT_NUMBER}</p>
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
            <td width="60%"></td>
            <td width="40%">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
                <tr>
                  <td style="padding:8px 12px;color:#6b7280;font-size:13px">Subtotal</td>
                  <td style="padding:8px 12px;color:#374151;font-size:13px;text-align:right;font-family:monospace">{currency} {subtotal:.2f}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px;color:#6b7280;font-size:13px">ITBIS (18%)</td>
                  <td style="padding:8px 12px;color:#374151;font-size:13px;text-align:right;font-family:monospace">{currency} {itbis:.2f}</td>
                </tr>
                <tr style="background:#f5f3ff">
                  <td style="padding:12px;color:#533afd;font-size:15px;font-weight:700;border-radius:6px 0 0 6px">Total</td>
                  <td style="padding:12px;color:#533afd;font-size:15px;font-weight:700;text-align:right;font-family:monospace;border-radius:0 6px 6px 0">{currency} {total:.2f}</td>
                </tr>
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

    try:
        response = resend.Emails.send({
            "from": BILLING_EMAIL_FROM,
            "reply_to": "billing@fintral.app",
            "to": [customer_email],
            "subject": f"Factura FIN-{datetime.utcnow().strftime('%Y%m')}-{hash(customer_email) % 10000:04d} — Fintral",
            "html": html,
        })
        logger.info("Purchase invoice email sent to %s — id=%s", customer_email, response.get("id"))
        return True
    except Exception as e:
        logger.warning("Failed to send purchase invoice email to %s: %s", customer_email, e)
        return False

