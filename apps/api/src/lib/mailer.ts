import nodemailer, { type Transporter } from "nodemailer";

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface Mailer {
  enabled: boolean;
  send(to: string, subject: string, text: string, attachments?: MailAttachment[]): Promise<void>;
}

// SMTP only (Gmail/Zoho/Outlook app password, or any provider's SMTP). No SMTP_URL = disabled.
export function createMailer(smtpUrl: string, from: string): Mailer {
  if (!smtpUrl) return { enabled: false, send: async () => {} };
  const transport: Transporter = nodemailer.createTransport(smtpUrl);
  return {
    enabled: true,
    async send(to, subject, text, attachments) {
      await transport.sendMail({ from, to, subject, text, attachments });
    },
  };
}
