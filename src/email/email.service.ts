import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { oauthFrontendBase } from '../auth/oauth-redirect.util';
import { buildPasswordResetEmailHtml } from './password-reset.template';

export type SendPasswordResetEmailInput = {
  to: string;
  token: string;
  userName?: string | null;
  expiresMinutes?: number;
};

type ResendSendResponse = {
  id?: string;
  message?: string;
  name?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string | undefined {
    return this.config.get<string>('RESEND_API_KEY')?.trim() || undefined;
  }

  private get frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
  }

  private get defaultLocale(): string {
    return this.config.get<string>('DEFAULT_LOCALE') ?? 'vi';
  }

  private get fromAddress(): string {
    return (
      this.config.get<string>('RESEND_FROM_EMAIL')?.trim() ||
      'CiNect <onboarding@resend.dev>'
    );
  }

  buildPasswordResetUrl(token: string): string {
    const base = oauthFrontendBase(this.frontendUrl, this.defaultLocale);
    const params = new URLSearchParams({ token });
    return `${base}/reset-password?${params.toString()}`;
  }

  async sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<boolean> {
    const expiresMinutes = input.expiresMinutes ?? 60;
    const resetUrl = this.buildPasswordResetUrl(input.token);
    const html = buildPasswordResetEmailHtml({
      resetUrl,
      userName: input.userName ?? '',
      expiresMinutes,
    });

    const apiKey = this.apiKey;
    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY is not configured — password reset email was not sent',
      );
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`[dev] Password reset link for ${input.to}: ${resetUrl}`);
      }
      return false;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [input.to],
          subject: 'Đặt lại mật khẩu CiNect',
          html,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as ResendSendResponse;

      if (!response.ok) {
        this.logger.error(
          `Resend failed for ${input.to} (${response.status}): ${payload.message ?? JSON.stringify(payload)}`,
        );
        return false;
      }

      this.logger.log(
        `Password reset email sent to ${input.to} (id: ${payload.id ?? 'n/a'})`,
      );
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Resend exception for ${input.to}: ${message}`);
      return false;
    }
  }

  async sendContactNotification(input: {
    name: string;
    email: string;
    subject: string;
    message: string;
    ticketId: string;
  }): Promise<boolean> {
    const to =
      this.config.get<string>('SUPPORT_EMAIL')?.trim() || 'cskh@cinect.com.vn';
    const apiKey = this.apiKey;
    const html = `
      <h2>New support message</h2>
      <p><strong>Ticket:</strong> ${input.ticketId}</p>
      <p><strong>Name:</strong> ${input.name}</p>
      <p><strong>Email:</strong> ${input.email}</p>
      <p><strong>Subject:</strong> ${input.subject}</p>
      <p>${input.message.replace(/\n/g, '<br/>')}</p>
    `;

    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY missing — contact email not sent');
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`[dev] Contact from ${input.email}: ${input.subject}`);
      }
      return false;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [to],
          replyTo: input.email,
          subject: `[CiNect Support] ${input.subject}`,
          html,
        }),
      });
      return response.ok;
    } catch (err) {
      this.logger.error(`Contact email failed: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }
}
