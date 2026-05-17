import logging

import resend

from app.config import EMAIL_FROM, RESEND_API_KEY

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
