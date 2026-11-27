import { STUDIO_DOMAIN } from "@/lib/site";

/**
 * El correo del estudio vive en el servidor de ProLinux, con los mismos datos que usa Outlook:
 * IMAP en mail.camaratbwa.com:993 y SMTP en mail.camaratbwa.com:465, los dos con SSL/TLS, y el usuario
 * es el mail completo. Se pueden cambiar con variables (CORREO_IMAP_HOST, etc.) si un día se muda.
 */

const num = (v: string | undefined, def: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : def;
};

export const CORREO = {
  dominio: (process.env.CORREO_DOMINIO || STUDIO_DOMAIN).toLowerCase(),
  imap: {
    host: process.env.CORREO_IMAP_HOST || `mail.${STUDIO_DOMAIN}`,
    port: num(process.env.CORREO_IMAP_PORT, 993),
  },
  smtp: {
    host: process.env.CORREO_SMTP_HOST || process.env.CORREO_IMAP_HOST || `mail.${STUDIO_DOMAIN}`,
    port: num(process.env.CORREO_SMTP_PORT, 465),
  },
};

/** Si ese mail puede tener casilla en la app. */
export const esDelDominio = (email: string | null | undefined) =>
  Boolean(email && email.toLowerCase().endsWith(`@${CORREO.dominio}`));
