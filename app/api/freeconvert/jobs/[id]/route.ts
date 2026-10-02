import { NextResponse } from "next/server";
import { fc, jobTasks, errorResponse, FAILED, FreeConvertError, type FcJob } from "@/lib/converter/freeconvert";

export const dynamic = "force-dynamic";

/** Estado resumido de un job: el cliente solo necesita saber si terminó y dónde bajar el resultado. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(params.id)) throw new FreeConvertError("Id inválido", 400);

    const job = await fc<FcJob>(`/process/jobs/${params.id}`);
    const tasks = await jobTasks(job);
    const exported = tasks.find((t) => t.operation === "export/url");
    const failed = tasks.find((t) => FAILED.has(t.status));

    if (exported?.status === "completed" && exported.result?.url) {
      return NextResponse.json({ status: "done", url: exported.result.url });
    }
    if (failed || FAILED.has(job.status)) {
      const message = failed?.message ?? failed?.code ?? "La conversión falló";
      return NextResponse.json({ status: "error", message });
    }

    const step = tasks.find((t) => t.status === "processing")?.operation ?? "queued";
    return NextResponse.json({ status: "processing", step });
  } catch (e) {
    return errorResponse(e);
  }
}
