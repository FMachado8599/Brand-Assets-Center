/** Un tip por día: lo que la app ya hace y casi nadie sabe. Cada uno lleva a donde se usa. */
export type Tip = { texto: string; href: string; accion: string };

export const TIPS: Tip[] = [
  { texto: "Con / enfocás el buscador de la herramienta en la que estás, sin tocar el mouse.", href: "/library/emojis", accion: "Probalo en Emojis" },
  { texto: "Con ⌘K (o Ctrl+K) buscás de una lo que sea: una herramienta, una marca, una persona, una tarea o un emoji.", href: "/", accion: "Abrí el buscador" },
  { texto: "En Descargas no hace falta tocar nada: pegás el link con Ctrl+V en cualquier parte de la página y arranca.", href: "/descargas", accion: "Ir a Descargas" },
  { texto: "En Retoque podés pegar una imagen copiada (de la web, de Figma, una captura) y le saca el fondo.", href: "/retoque", accion: "Ir a Retoque" },
  { texto: "Redacción copia el texto listo para WhatsApp o con las negritas que se ven en redes.", href: "/redaccion", accion: "Ir a Redacción" },
  { texto: "Una tarjeta se pega en Illustrator con su tipografía: el texto llega en vectores y con su fuente.", href: "/tarjetas", accion: "Ir a Tarjetas" },
  { texto: "En Ads, si arrastrás varias imágenes juntas, se arma el carrusel solo.", href: "/ads", accion: "Ir a Ads" },
  { texto: "En GIF, los frames se agrupan solos por el nombre del archivo: banner_1, banner_2…", href: "/gif", accion: "Ir a GIF" },
  { texto: "/library abre la última librería que usaste: Emojis, GIFs o Íconos.", href: "/library", accion: "Abrir Librerías" },
  { texto: "Los emojis se buscan en español o en inglés, y también por lo que significan: «festejo» encuentra 🎉.", href: "/library/emojis", accion: "Buscar emojis" },
  { texto: "Un SVG copiado de Íconos se pega en Figma o Illustrator como vector, listo para editar.", href: "/library/iconos", accion: "Ir a Íconos" },
  { texto: "Tu estado se puede borrar solo: «En reunión» hasta dentro de una hora, y listo.", href: "/perfil", accion: "Ir a tu perfil" },
  { texto: "En el Board, arrastrar una tarjeta dentro de su columna cambia la prioridad; a otra columna, la etapa.", href: "/board", accion: "Ir al Board" },
  { texto: "El modo noche se prende desde tu foto, arriba a la derecha, y te sigue a cualquier computadora.", href: "/perfil", accion: "Ver tu perfil" },
  { texto: "Si soltás un archivo en el Inicio, te pregunta qué hacer: convertirlo, comprimirlo, quitarle el fondo o verlo en Ads.", href: "/", accion: "Probalo acá" },
  { texto: "Con el modo marca elegís una marca en el Inicio y Redacción, Tarjetas, Ads y Presentaciones arrancan con ella.", href: "/", accion: "Elegir una marca" },
  { texto: "La ficha de cada cliente tiene sus logos en todos los formatos: se bajan de a uno o todos juntos en un .zip.", href: "/clientes", accion: "Ir a Clientes" },
  { texto: "En Rest el ranking arranca de cero cada lunes: siempre hay revancha.", href: "/rest", accion: "Ir a Rest" },
];

/** El de hoy: cambia cada día y es el mismo todo el día. */
export function tipDelDia(d = new Date()) {
  const n = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
  return TIPS[n % TIPS.length];
}
