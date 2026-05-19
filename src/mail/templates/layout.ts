/**
 * Layout HTML commun à tous les emails SACPROMI.
 * Compatible avec les principaux clients mail (Gmail, Outlook, Apple Mail).
 */
export function renderEmailLayout(opts: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(opts.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F1F5F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0F1F14;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F1F5F0;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(15,31,20,0.08);">
            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#065F46 0%,#047857 50%,#10B981 100%);padding:32px 28px;color:#ffffff;text-align:left;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <span style="display:inline-block;width:40px;height:40px;line-height:40px;background:rgba(255,255,255,0.18);border-radius:10px;text-align:center;font-size:20px;vertical-align:middle;">🌱</span>
                      <span style="display:inline-block;margin-left:12px;font-size:24px;font-weight:800;letter-spacing:-0.5px;vertical-align:middle;">SACPROMI</span>
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <span style="display:inline-block;font-size:11px;color:rgba(255,255,255,0.8);font-weight:600;text-transform:uppercase;letter-spacing:1.5px;">Gestion intégrée</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:36px 32px;">
                ${opts.body}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#0A1410;color:rgba(226,235,228,0.7);padding:24px 28px;font-size:12px;line-height:1.6;text-align:center;">
                <p style="margin:0 0 6px;color:#ffffff;font-weight:600;">SACPROMI — Sénégal</p>
                <p style="margin:0;">Production d'aliments pour animaux & élevage de poulets</p>
                <p style="margin:12px 0 0;font-size:11px;opacity:0.7;">Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
