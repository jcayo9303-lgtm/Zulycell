import nodemailer from "nodemailer";
import { config } from "../config.js";
import { logger } from "./logger.js";

const transport = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
});

export async function sendEmail(to: string, subject: string, text: string) {
  await transport.sendMail({ from: config.smtp.from, to, subject, text });
}

/** Envío de WhatsApp. "log" para desarrollo; "http" para un proveedor (Meta Cloud API, Twilio, etc.). */
export async function sendWhatsApp(to: string, text: string) {
  if (config.whatsapp.provider === "log") {
    logger.info({ to, text }, "[whatsapp:log] mensaje no enviado (modo desarrollo)");
    return;
  }
  const res = await fetch(config.whatsapp.apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.whatsapp.apiToken}` },
    body: JSON.stringify({ to, text }),
  });
  if (!res.ok) throw new Error(`WhatsApp provider respondió ${res.status}`);
}

/** Enlace wa.me para que el usuario envíe el mensaje desde su propio WhatsApp. */
export function waLink(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
