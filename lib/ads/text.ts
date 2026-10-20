/** Instagram en español o en inglés: cambia el largo de los textos que tapan (ej: «Más información» y «Learn more»). */
export type Lang = "es" | "en";

export const UI_TEXT: Record<Lang, { ad: string; comment: string; notInterested: string; interested: string; swipe: string }> = {
  es: {
    ad: "Publicidad",
    comment: "Agrega un comentario...",
    notInterested: "No me interesa",
    interested: "Me interesa",
    swipe: "Desliza hacia arriba para ver el formulario",
  },
  en: {
    ad: "Ad",
    comment: "Add a comment...",
    notInterested: "Not interested",
    interested: "Interested",
    swipe: "Swipe up to view form",
  },
};

/** Los botones de llamada a la acción de Meta, como los muestra Instagram en cada idioma. Se guardan por el de español. */
export const CTAS: { es: string; en: string }[] = [
  { es: "Más información", en: "Learn more" },
  { es: "Comprar", en: "Shop now" },
  { es: "Registrarte", en: "Sign up" },
  { es: "Reservar", en: "Book now" },
  { es: "Contactarnos", en: "Contact us" },
  { es: "Enviar mensaje", en: "Send message" },
  { es: "Enviar mensaje de WhatsApp", en: "Send WhatsApp message" },
  { es: "Me interesa", en: "I'm interested" },
  { es: "Obtener oferta", en: "Get offer" },
  { es: "Solicitar ahora", en: "Apply now" },
  { es: "Pedir ahora", en: "Order now" },
  { es: "Descargar", en: "Download" },
  { es: "Ver más", en: "Watch more" },
  { es: "Suscribirte", en: "Subscribe" },
  { es: "Obtener cotización", en: "Get quote" },
];

export const ctaText = (cta: string, lang: Lang) => CTAS.find((c) => c.es === cta)?.[lang] ?? cta;
