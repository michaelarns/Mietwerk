import "server-only";

import nodemailer from "nodemailer";

import { env } from "~/env";

/**
 * Minimal transactional mailer. Locally this targets Mailpit (SMTP on
 * localhost:1025, web UI at :8025) — the same transport Auth.js uses for magic
 * links. Phase 2 uses it to "send" dunning letters as plain text/E-Mail; PDF
 * output is Phase 4.
 */
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.EMAIL_SERVER_HOST,
    port: env.EMAIL_SERVER_PORT,
    secure: false,
    auth: env.EMAIL_SERVER_USER
      ? { user: env.EMAIL_SERVER_USER, pass: env.EMAIL_SERVER_PASSWORD }
      : undefined,
  });
  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
}

/** Send a plain-text email. Returns the provider message id. */
export async function sendMail(input: SendMailInput): Promise<string> {
  const info = (await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
  })) as { messageId?: string };
  return info.messageId ?? "";
}
