/**
 * Email HTML templates for ArtArtist platform
 * Clean, modern, email-client-safe design
 */

const ARTIST_LOGO_URL = process.env.ARTIST_LOGO_URL || '';

const artistInviteEmail = (artistName, email, dashboardUrl) => {
  const year = new Date().getFullYear();
  const logoHtml = ARTIST_LOGO_URL
    ? `<img src="${ARTIST_LOGO_URL}" alt="ArtArtist" width="140" height="auto" style="display:block;margin:0 auto 24px;max-height:52px;width:auto;" />`
    : `<div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:1px;margin-bottom:24px;">ArtArtist</div>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ArtArtist</title>
  <style>
    body { margin:0; padding:0; background-color:#f4f4f5; -webkit-font-smoothing:antialiased; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; display:block; }
    a { text-decoration:none; }
    @media only screen and (max-width:600px) {
      .wrapper { width:100% !important; }
      .pad { padding-left:24px !important; padding-right:24px !important; }
      .btn { width:100% !important; display:block !important; box-sizing:border-box !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">

  <!-- OUTER WRAPPER -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="wrapper" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">

          <!-- HERO -->
          <tr>
            <td style="background:#111111;border-radius:20px 20px 0 0;padding:48px 40px 36px;text-align:center;" class="pad">
              ${logoHtml}
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 20px;">
                <tr>
                  <td style="background:rgba(220,38,38,0.12);border:1px solid rgba(220,38,38,0.30);border-radius:100px;padding:5px 16px;">
                    <span style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1.5px;">Artist Onboarding</span>
                  </td>
                </tr>
              </table>
              <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;color:#ffffff;margin:0 0 8px 0;line-height:1.2;">Welcome to ArtArtist</h1>
              <p style="font-family:Arial,sans-serif;font-size:14px;color:#a1a1aa;margin:0;">Your creative journey starts here</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px;" class="pad">
              <p style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;color:#18181b;margin:0 0 8px 0;">Hello <span style="color:#dc2626;">${artistName || 'Artist'}</span>,</p>
              <p style="font-family:Arial,sans-serif;font-size:14px;color:#52525b;line-height:1.7;margin:0 0 28px 0;">
                Your artist profile has been created on the ArtArtist platform. Showcase your art, manage your portfolio, and connect with collectors worldwide.
              </p>

              <!-- EMAIL CARD -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:24px;text-align:center;">
                    <p style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1.2px;margin:0 0 8px 0;">Your Dashboard Login</p>
                    <p style="font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#18181b;margin:0;word-break:break-all;">${email}</p>
                  </td>
                </tr>
              </table>

              <!-- STEPS -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#fafafa;border-radius:14px;padding:24px;">
                    <p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#18181b;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 18px 0;">How to Access Your Dashboard</p>

                    <!-- Step 1 -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:14px;">
                      <tr>
                        <td width="32" valign="top" style="padding-right:14px;">
                          <p style="margin:0;width:32px;height:32px;background:#dc2626;border-radius:50%;text-align:center;line-height:32px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#ffffff;mso-line-height-rule:exactly;">1</p>
                        </td>
                        <td valign="top" style="font-family:Arial,sans-serif;font-size:13px;color:#3f3f46;line-height:1.6;padding-top:6px;">
                          <strong style="color:#18181b;">Visit</strong> the Artist Dashboard and enter your email address.
                        </td>
                      </tr>
                    </table>

                    <!-- Step 2 -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:14px;">
                      <tr>
                        <td width="32" valign="top" style="padding-right:14px;">
                          <p style="margin:0;width:32px;height:32px;background:#dc2626;border-radius:50%;text-align:center;line-height:32px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#ffffff;mso-line-height-rule:exactly;">2</p>
                        </td>
                        <td valign="top" style="font-family:Arial,sans-serif;font-size:13px;color:#3f3f46;line-height:1.6;padding-top:6px;">
                          <strong style="color:#18181b;">Request OTP</strong> — a 6-digit code will be sent to your inbox instantly.
                        </td>
                      </tr>
                    </table>

                    <!-- Step 3 -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td width="32" valign="top" style="padding-right:14px;">
                          <p style="margin:0;width:32px;height:32px;background:#dc2626;border-radius:50%;text-align:center;line-height:32px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#ffffff;mso-line-height-rule:exactly;">3</p>
                        </td>
                        <td valign="top" style="font-family:Arial,sans-serif;font-size:13px;color:#3f3f46;line-height:1.6;padding-top:6px;">
                          <strong style="color:#18181b;">Enter the code</strong> to log in securely. No password needed!
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:10px;">
                <tr>
                  <td align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${dashboardUrl}" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="12%" stroke="f" fillcolor="#dc2626">
                    <w:anchorlock/>
                    <center>
                    <![endif]-->
                    <a href="${dashboardUrl}" target="_blank" style="display:inline-block;background:#dc2626;color:#ffffff !important;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:52px;text-align:center;text-decoration:none !important;width:260px;border-radius:12px;mso-hide:all;">
                      <span style="color:#ffffff !important;text-decoration:none !important;">Open Artist Dashboard</span>
                    </a>
                    <!--[if mso]>
                    </center>
                    </v:roundrect>
                    <![endif]-->
                  </td>
                </tr>
              </table>
              <p style="font-family:Arial,sans-serif;font-size:11px;color:#a1a1aa;text-align:center;margin:0;">Secure, password-less login with OTP verification</p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#18181b;border-radius:0 0 20px 20px;padding:32px 40px;text-align:center;" class="pad">
              <p style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#ffffff;margin:0 0 12px 0;letter-spacing:0.5px;">ArtArtist</p>
              <table role="presentation" width="40" height="2" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 16px;background:#dc2626;border-radius:1px;">
                <tr><td style="font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <p style="font-family:Arial,sans-serif;font-size:12px;color:#a1a1aa;margin:0 0 4px 0;">Need help? Reach us at <a href="mailto:support@artartist.com" style="color:#ef4444;font-weight:600;">support@artartist.com</a></p>
              <p style="font-family:Arial,sans-serif;font-size:11px;color:#71717a;margin:0;">ArtArtist &copy; ${year}. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
`;
};

const bulkAnnouncementEmail = (subject, message, events = []) => {
  const year = new Date().getFullYear();
  const logoHtml = ARTIST_LOGO_URL
    ? `<img src="${ARTIST_LOGO_URL}" alt="ArtArtist" width="140" height="auto" style="display:block;margin:0 auto 24px;max-height:52px;width:auto;" />`
    : `<div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:1px;margin-bottom:24px;">ArtArtist</div>`;

  const eventsHtml = events.length > 0
    ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td style="background:#fafafa;border-radius:14px;padding:24px;">
          <p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#18181b;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 18px 0;">Upcoming Events</p>
          ${events.map(ev => `
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:14px;">
            <tr>
              <td width="60" valign="top" style="padding-right:12px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" style="background:#dc2626;border-radius:10px;width:52px;height:52px;mso-line-height-rule:exactly;line-height:52px;text-align:center;">
                      <span style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;">${new Date(ev.date?.start || ev.dateStart).toLocaleDateString('en-US', { month: 'short' })}</span><br/>
                      <span style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff;line-height:1;">${new Date(ev.date?.start || ev.dateStart).getDate()}</span>
                    </td>
                  </tr>
                </table>
              </td>
              <td valign="top" style="font-family:Arial,sans-serif;font-size:13px;color:#3f3f46;line-height:1.6;">
                <p style="margin:0 0 4px 0;font-weight:700;color:#18181b;font-size:14px;">${ev.title}</p>
                <p style="margin:0 0 4px 0;">${ev.category ? ev.category.charAt(0).toUpperCase() + ev.category.slice(1) : 'Event'} &middot; ${ev.location?.city || 'Online'}</p>
                <p style="margin:0;color:#a1a1aa;font-size:12px;">${(ev.description || '').substring(0, 80)}${(ev.description || '').length > 80 ? '...' : ''}</p>
              </td>
            </tr>
          </table>
          `).join('')}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td align="center">
                <a href="${process.env.FRONTEND_URL || 'https://artartist.com'}/events" target="_blank" style="display:inline-block;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#dc2626;text-decoration:none;padding:8px 20px;border:1.5px solid #dc2626;border-radius:8px;">View All Events</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    `
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin:0; padding:0; background-color:#f4f4f5; -webkit-font-smoothing:antialiased; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; display:block; }
    a { text-decoration:none; }
    @media only screen and (max-width:600px) {
      .wrapper { width:100% !important; }
      .pad { padding-left:24px !important; padding-right:24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="wrapper" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="background:#111111;border-radius:20px 20px 0 0;padding:48px 40px 36px;text-align:center;" class="pad">
              ${logoHtml}
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 20px;">
                <tr>
                  <td style="background:rgba(220,38,38,0.12);border:1px solid rgba(220,38,38,0.30);border-radius:100px;padding:5px 16px;">
                    <span style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1.5px;">Announcement</span>
                  </td>
                </tr>
              </table>
              <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:#ffffff;margin:0 0 8px 0;line-height:1.2;">${subject}</h1>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px;" class="pad">
              <p style="font-family:Arial,sans-serif;font-size:14px;color:#52525b;line-height:1.7;margin:0 0 28px 0;white-space:pre-line;">${message.replace(/\n/g, '<br/>')}</p>
              ${eventsHtml}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center">
                    <a href="${process.env.FRONTEND_URL || 'https://artartist.com'}" target="_blank" style="display:inline-block;background:#dc2626;color:#ffffff !important;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:52px;text-align:center;text-decoration:none !important;width:220px;border-radius:12px;">
                      <span style="color:#ffffff !important;text-decoration:none !important;">Visit ArtArtist</span>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#18181b;border-radius:0 0 20px 20px;padding:32px 40px;text-align:center;" class="pad">
              <p style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#ffffff;margin:0 0 12px 0;letter-spacing:0.5px;">ArtArtist</p>
              <table role="presentation" width="40" height="2" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 16px;background:#dc2626;border-radius:1px;">
                <tr><td style="font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <p style="font-family:Arial,sans-serif;font-size:12px;color:#a1a1aa;margin:0 0 4px 0;">Need help? Reach us at <a href="mailto:support@artartist.com" style="color:#ef4444;font-weight:600;">support@artartist.com</a></p>
              <p style="font-family:Arial,sans-serif;font-size:11px;color:#71717a;margin:0;">ArtArtist &copy; ${year}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

module.exports = { artistInviteEmail, bulkAnnouncementEmail };

