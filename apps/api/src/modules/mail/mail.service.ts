import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { AppLocale, isSupportedLocale, translate, TranslateParams } from '@stockiteasy/i18n';
import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';

export interface SentMail {
  to: string;
  subject: string;
  text: string;
  sentAt: Date;
}

/**
 * Sends transactional e-mails in the recipient's language.
 * Without SMTP configuration (local development, tests) messages are logged
 * and kept in an in-memory outbox instead of being delivered.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private transporter?: Transporter;
  readonly outbox: SentMail[] = [];

  constructor() {
    const e = env();
    if (e.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: e.SMTP_HOST,
        port: e.SMTP_PORT ?? 587,
        auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
      });
    }
  }

  async sendTemplate(to: string, locale: string, template: 'verify' | 'reset' | 'invite', params: TranslateParams) {
    const l: AppLocale = isSupportedLocale(locale) ? locale : 'fr-TN';
    const subject = translate(l, `emails.${template}Subject`, params);
    const text = translate(l, `emails.${template}Body`, params);
    await this.send(to, subject, text);
  }

  async send(to: string, subject: string, text: string) {
    this.outbox.push({ to, subject, text, sentAt: new Date() });
    if (this.outbox.length > 100) this.outbox.shift();
    if (!this.transporter) {
      if (env().NODE_ENV !== 'test') this.logger.log(`[dev mail] to=${to} subject="${subject}"\n${text}`);
      return;
    }
    await this.transporter.sendMail({ from: env().MAIL_FROM, to, subject, text });
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
