/**
 * Del navegador: pide que salga lo que quedó en la cola de Slack después de algo que puede generar un
 * aviso (pasar una tarea, comentar con @, el cliente comentando o aprobando). Espera unos segundos por
 * si vienen más (aprobar varias piezas seguidas sale en un solo mensaje) y nunca falla ni avisa nada.
 */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function despacharSlack(url = "/api/slack/enviar", demora = 3000) {
  if (typeof window === "undefined") return;
  clearTimeout(timers.get(url));
  timers.set(
    url,
    setTimeout(() => {
      timers.delete(url);
      fetch(url, { method: "POST", keepalive: true }).catch(() => undefined);
    }, demora)
  );
}
