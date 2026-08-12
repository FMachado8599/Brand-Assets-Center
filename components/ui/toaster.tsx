"use client";
import * as React from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

type Toast = { id: number; message: string; kind: "ok" | "error" };

let emit: ((t: Omit<Toast, "id">) => void) | null = null;

export function toast(message: string, kind: "ok" | "error" = "ok") {
  emit?.({ message, kind });
}

export function Toaster() {
  const [items, setItems] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    emit = (t) => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { ...t, id }]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 3200);
    };
    return () => {
      emit = null;
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed bottom-5 left-1/2 z-[80] flex w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2.5 rounded-lg border bg-foreground px-4 py-3 text-sm text-background shadow-lg animate-in slide-in-from-bottom-2 fade-in"
        >
          {t.kind === "ok" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
