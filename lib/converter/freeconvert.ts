import { NextResponse } from "next/server";

/**
 * Cliente mínimo de FreeConvert para el servidor. La API key vive solo acá:
 * el navegador habla con nuestras rutas /api/freeconvert/*, nunca con la key.
 */

const BASE = "https://api.freeconvert.com/v1";

export class FreeConvertError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

export function hasFreeConvertKey() {
  return Boolean(process.env.FREECONVERT_API_KEY);
}

export async function fc<T = any>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.FREECONVERT_API_KEY;
  if (!key) throw new FreeConvertError("Falta configurar FREECONVERT_API_KEY", 500);

  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.message ?? body?.error ?? `FreeConvert respondió ${res.status}`;
    throw new FreeConvertError(typeof msg === "string" ? msg : JSON.stringify(msg), res.status);
  }
  return body as T;
}

export type FcTask = {
  id: string;
  name?: string;
  operation: string;
  status: string;
  message?: string;
  code?: string;
  result?: {
    url?: string;
    form?: { url: string; parameters: Record<string, string> };
    [k: string]: unknown;
  };
};

export type FcJob = { id: string; status: string; tasks: (FcTask | string)[] };

/** Un job puede traer las tareas pobladas o solo sus ids: normalizamos a objetos. */
export async function jobTasks(job: FcJob): Promise<FcTask[]> {
  return Promise.all(
    (job.tasks ?? []).map((t) => (typeof t === "string" ? fc<FcTask>(`/process/tasks/${t}`) : t))
  );
}

export const FAILED = new Set(["failed", "error", "canceled", "cancelled", "deleted", "incomplete"]);

export function errorResponse(e: unknown) {
  const status = e instanceof FreeConvertError ? e.status : 500;
  const message = e instanceof Error ? e.message : "Algo falló";
  return NextResponse.json({ error: message }, { status: status >= 400 && status < 600 ? status : 500 });
}
