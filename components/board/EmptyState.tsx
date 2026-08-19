"use client";

import { Button } from "@/components/ui/button";
import { FileText, Plus } from "lucide-react";

export function EmptyState({ filtered, onCreate }: { filtered: boolean; onCreate: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card px-6 py-14 text-center">
      <FileText className="mx-auto h-7 w-7 text-muted-foreground" />
      <p className="mt-3 font-medium">{filtered ? "Ningún resultado con estos filtros" : "Todavía no hay tarjetas"}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {filtered
          ? "Probá quitando algún filtro o cambiando la búsqueda."
          : "Creá la primera y va a aparecer acá, lista para copiar."}
      </p>
      {!filtered && (
        <Button className="mt-5" onClick={onCreate}>
          <Plus /> Nueva tarjeta
        </Button>
      )}
    </div>
  );
}
