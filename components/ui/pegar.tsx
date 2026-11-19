"use client";

import { ClipboardPaste } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

/**
 * Lo que hay en el portapapeles, o null si el navegador no deja leerlo (lo pide la primera vez; en
 * Safari y Firefox aparece un "Pegar" para confirmar).
 */
async function leerPortapapeles(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    toast("No se pudo leer el portapapeles: permití el acceso o pegá con Ctrl+V", "error");
    return null;
  }
}

/**
 * Pega en el cursor de un textarea o input (reemplaza lo seleccionado) como si se hubiera escrito:
 * dispara el onChange de React y deja el cursor después de lo pegado.
 */
export function pegarEn(el: HTMLTextAreaElement | HTMLInputElement, texto: string) {
  const inicio = el.selectionStart ?? el.value.length;
  const fin = el.selectionEnd ?? el.value.length;
  const nuevo = el.value.slice(0, inicio) + texto + el.value.slice(fin);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, nuevo);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
  const cursor = inicio + texto.length;
  el.setSelectionRange(cursor, cursor);
}

/** El botón chico de "Pegar", para arriba a la derecha de un campo de texto. */
export function BotonPegar({ onTexto, className }: { onTexto: (texto: string) => void; className?: string }) {
  return (
    <button
      type="button"
      title="Pegar lo copiado"
      aria-label="Pegar lo copiado"
      // Que no le saque el foco (ni la selección) al campo.
      onMouseDown={(e) => e.preventDefault()}
      onClick={async () => {
        const texto = await leerPortapapeles();
        if (texto) onTexto(texto);
        else if (texto === "") toast("No hay nada copiado");
      }}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full bg-card/90 px-2 text-[11px] font-medium text-muted-foreground shadow-sm ring-1 ring-black/[0.06] transition-colors hover:text-foreground",
        className
      )}
    >
      <ClipboardPaste className="h-3 w-3" /> Pegar
    </button>
  );
}
