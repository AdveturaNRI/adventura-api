import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private fromAddress = '';
  private configured = false;

  constructor(private readonly config: ConfigService) {
    this.bootstrap();
  }

  isConfigured() {
    return this.configured;
  }

  private bootstrap() {
    const host = this.config.get<string>('SMTP_HOST')?.trim() ?? '';
    const user = this.config.get<string>('SMTP_USER')?.trim() ?? '';
    const pass = this.config.get<string>('SMTP_PASS')?.trim() ?? '';
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');
    const secure =
      (this.config.get<string>('SMTP_SECURE')?.trim() ?? '').toLowerCase() ===
        'true' || port === 465;
    const from =
      this.config.get<string>('SMTP_FROM')?.trim() ||
      'Adventura <noreply@adventu.ru>';

    if (!host || !user || !pass) {
      this.logger.warn('SMTP not configured — outbound email disabled');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    this.fromAddress = from;
    this.configured = true;
    this.logger.log(`SMTP ready → ${host}:${port}`);
  }

  async sendMail(input: SendMailInput): Promise<boolean> {
    if (!this.transporter || !this.configured) {
      this.logger.warn(
        `Skip mail to ${input.to}: SMTP is not configured (${input.subject})`,
      );
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send mail to ${input.to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
