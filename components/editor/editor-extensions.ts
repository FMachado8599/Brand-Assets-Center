import TextStyle from "@tiptap/extension-text-style";

/**
 * Extiende TextStyle para que cada fragmento de texto pueda guardar su
 * propia fuente, peso y tamaño. Se serializa como estilos inline dentro
 * del HTML, así que la tarjeta guardada ya contiene toda la información
 * tipográfica: no hace falta ninguna tabla aparte.
 */
export const FontSpec = TextStyle.extend({
  addAttributes() {
    return {
      fontFamily: {
        default: null,
        parseHTML: (el) => el.style.fontFamily?.split(",")[0].replace(/['"]/g, "").trim() || null,
        renderHTML: (attrs) =>
          attrs.fontFamily ? { style: `font-family:'${attrs.fontFamily}'` } : {},
      },
      fontWeight: {
        default: null,
        parseHTML: (el) => el.style.fontWeight || null,
        renderHTML: (attrs) => (attrs.fontWeight ? { style: `font-weight:${attrs.fontWeight}` } : {}),
      },
      fontSize: {
        default: null,
        parseHTML: (el) => el.style.fontSize || null,
        renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {}),
      },
    };
  },
});
