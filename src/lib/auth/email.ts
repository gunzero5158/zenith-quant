import nodemailer from "nodemailer";

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  if (!isSmtpConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP is not configured");
    }
    console.log(`[DEV] Verification code for ${to}: ${code}`);
    return;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `【Zenith Quant】邮箱验证码：${code}`,
    text: `您的验证码是 ${code}，10 分钟内有效。如非本人操作请忽略本邮件。`,
    html: `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="color:#131722">Zenith Quant 邮箱验证</h2>
      <p>您的验证码是：</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#2962ff;padding:12px 0">${code}</div>
      <p style="color:#666">10 分钟内有效。如非本人操作请忽略本邮件。</p>
    </div>`,
  });
}
