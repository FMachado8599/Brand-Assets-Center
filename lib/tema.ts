/**
 * Modo noche. La preferencia se guarda con useStoredState (en este navegador y, con sesión, en la cuenta),
 * y se aplica con la clase "dark" en <html>: las variables de color de globals.css cambian solas.
 *
 * Sin "use client" a propósito: el layout (servidor) usa la clave y el script del <head>.
 */
export const MODO_NOCHE_KEY = "app:modo-noche";

/** El color de la barra del navegador en el celular: el fondo de día y el de noche (globals.css). */
const THEME_COLOR = { dia: "#ebe7dd", noche: "#151518" };

/**
 * Lo que ve el cliente se ve siempre de día: la plani compartida (/p/…) y el modo Presentar, que es esa
 * misma vista para mostrarla en una reunión. El script del <head> usa esta misma expresión.
 */
const DE_DIA = /^\/(p\/|presentaciones\/[^/]+\/presentar(\/|$))/;
export const siempreDeDia = (pathname: string) => DE_DIA.test(pathname);

/**
 * Pone o saca el modo noche. Apaga las transiciones durante el cambio: si no, lo que tiene transition-colors
 * se desvanece despacio y el resto cambia de golpe, y la pantalla queda a medio camino por un momento.
 */
export function aplicarModoNoche(noche: boolean) {
  const root = document.documentElement;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", noche ? THEME_COLOR.noche : THEME_COLOR.dia);
  if (root.classList.contains("dark") === noche) return;
  const pausa = document.createElement("style");
  pausa.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(pausa);
  root.classList.toggle("dark", noche);
  // Fuerza el repintado con las transiciones apagadas antes de volver a prenderlas.
  void window.getComputedStyle(document.body).backgroundColor;
  setTimeout(() => pausa.remove(), 1);
}

/**
 * Va en el <head>: pone el modo noche antes del primer pintado, así no se ve un destello claro al cargar.
 * useStoredState guarda en JSON, así que prendido es el texto "true".
 */
export const MODO_NOCHE_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(MODO_NOCHE_KEY)})==="true"&&!${DE_DIA}.test(location.pathname))document.documentElement.classList.add("dark")}catch(e){}`;
