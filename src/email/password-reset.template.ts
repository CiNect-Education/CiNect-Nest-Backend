export type PasswordResetEmailParams = {
  resetUrl: string;
  userName: string;
  expiresMinutes: number;
};

export function buildPasswordResetEmailHtml({
  resetUrl,
  userName,
  expiresMinutes,
}: PasswordResetEmailParams): string {
  const safeName = userName.trim() || 'bạn';

  return `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Đặt lại mật khẩu CiNect</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',system-ui,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:24px 28px;background:linear-gradient(135deg,#663399 0%,#1e1b4b 100%);">
                <div style="font-size:22px;font-weight:800;color:#f3ea28;letter-spacing:0.04em;">CiNect</div>
                <div style="margin-top:8px;font-size:14px;color:#ffffff;opacity:0.92;">Đặt lại mật khẩu</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Xin chào ${escapeHtml(safeName)},</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">
                  Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản CiNect của bạn.
                  Nhấn nút bên dưới để tạo mật khẩu mới. Liên kết sẽ hết hạn sau ${expiresMinutes} phút.
                </p>
                <p style="margin:0 0 24px;text-align:center;">
                  <a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 24px;background:#663399;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">
                    Đặt lại mật khẩu
                  </a>
                </p>
                <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#64748b;">
                  Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;word-break:break-all;">
                  Nếu nút không hoạt động, sao chép liên kết sau vào trình duyệt:<br />
                  <a href="${escapeHtml(resetUrl)}" style="color:#663399;">${escapeHtml(resetUrl)}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;">
                © CiNect — Email tự động, vui lòng không trả lời.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
