/** Lo que devuelve /api/board/resumen: lo que hay de Basecamp en la base, contado por proyecto. */

export type ProyectoResumen = {
  id: number;
  nombre: string;
  estado: string;
  app_url: string | null;
  ignorado: boolean;
  cliente: { id: string; name: string } | null;
  tableros: number;
  tareas: number;
  abiertas: number;
  /** null si falta migracion-board.sql. */
  miembros: number | null;
};

export type BoardResumen = {
  proyectos: ProyectoResumen[];
  totales: {
    proyectos: number;
    archivados: number;
    personas: number;
    tableros: number;
    tareas: number;
    abiertas: number;
    miembros: number | null;
  };
};
