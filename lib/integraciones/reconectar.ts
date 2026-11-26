/**
 * La conexión guardada ya no sirve en este entorno y hay que volver a conectar: se cifró con otra
 * INTEGRACIONES_SECRET (ej: se conectó desde local), o el servicio no la deja renovar. El mensaje
 * siempre dice "volvé a conectar…": la app lo reconoce así también cuando viene guardado en la base.
 * Sin dependencias: lo usan el servidor y la página.
 */
export class ReconectarError extends Error {}

/** Si un mensaje de error pide volver a conectar la cuenta. */
export const pideReconectar = (message: string | null | undefined) => /volv(é|er) a conectar/i.test(message ?? "");
