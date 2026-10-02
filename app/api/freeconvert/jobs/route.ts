import { NextResponse } from "next/server";
import { fc, jobTasks, errorResponse, FreeConvertError, type FcJob, type FcTask } from "@/lib/converter/freeconvert";

export const dynamic = "force-dynamic";

const FORMAT = /^[a-z0-9]{1,12}$/;
const OPERATIONS = new Set(["convert", "compress"]);

/**
 * Crea un job importar → convertir/comprimir → exportar. Devuelve el formulario
 * firmado de subida para que el navegador mande el archivo directo a FreeConvert
 * (así no pasa por nuestro servidor ni choca con el límite de body de Vercel).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const operation = String(body?.operation ?? "");
    const inputFormat = String(body?.inputFormat ?? "").toLowerCase();
    const outputFormat = String(body?.outputFormat ?? "").toLowerCase();
    const options = sanitizeOptions(body?.options);

    if (!OPERATIONS.has(operation)) throw new FreeConvertError("Operación inválida", 400);
    if (!FORMAT.test(inputFormat) || !FORMAT.test(outputFormat)) throw new FreeConvertError("Formato inválido", 400);

    const job = await fc<FcJob>("/process/jobs", {
      method: "POST",
      body: JSON.stringify({
        tasks: {
          "import-1": { operation: "import/upload" },
          "process-1": {
            operation,
            input: "import-1",
            input_format: inputFormat,
            output_format: outputFormat,
            ...(Object.keys(options).length ? { options } : {}),
          },
          "export-1": { operation: "export/url", input: ["process-1"] },
        },
      }),
    });

    const upload = await uploadForm(job);
    return NextResponse.json({ jobId: job.id, upload });
  } catch (e) {
    return errorResponse(e);
  }
}

async function uploadForm(job: FcJob) {
  const tasks = await jobTasks(job);
  let task = tasks.find((t) => t.operation === "import/upload");
  if (!task) throw new FreeConvertError("FreeConvert no devolvió la tarea de subida");

  // El formulario firmado a veces tarda un instante en aparecer.
  for (let i = 0; !task.result?.form && i < 6; i++) {
    await new Promise((r) => setTimeout(r, 500));
    task = await fc<FcTask>(`/process/tasks/${task.id}`);
  }
  if (!task.result?.form) throw new FreeConvertError("FreeConvert no devolvió el formulario de subida");
  return task.result.form;
}

function sanitizeOptions(raw: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw).slice(0, 60)) {
    if (!/^[a-z0-9_-]{1,64}$/i.test(k)) continue;
    if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
    else if (typeof v === "string" && v.length <= 200) out[k] = v;
  }
  return out;
}
