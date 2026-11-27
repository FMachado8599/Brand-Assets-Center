"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { documentoMail } from "@/lib/correo/cliente";

/**
 * El texto del mail, en un iframe aislado: sin scripts (sandbox sin allow-scripts), limpio con DOMPurify
 * y sin cargar nada de afuera hasta que tocás "Mostrar imágenes". Se estira a la altura del mail.
 */
export function CuerpoMail({ html, texto }: { html: string | null; texto: string | null }) {
  const [imagenes, setImagenes] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [alto, setAlto] = useState(200);
  const { doc, remotas } = useMemo(() => documentoMail(html, texto, imagenes), [html, texto, imagenes]);

  useEffect(() => setImagenes(false), [html, texto]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let ro: ResizeObserver | null = null;
    const medir = () => {
      const d = el.contentDocument;
      if (d?.documentElement) setAlto(Math.max(120, d.documentElement.scrollHeight));
    };
    const alCargar = () => {
      medir();
      const body = el.contentDocument?.body;
      if (body) {
        ro?.disconnect();
        ro = new ResizeObserver(medir);
        ro.observe(body);
      }
    };
    el.addEventListener("load", alCargar);
    return () => {
      el.removeEventListener("load", alCargar);
      ro?.disconnect();
    };
  }, [doc]);

  return (
    <div>
      {remotas && !imagenes && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-secondary/60 px-5 py-2 text-[13px] text-muted-foreground">
          <ImageOff className="h-4 w-4 shrink-0" />
          <span className="flex-1">Las imágenes de afuera están ocultas: sirven para saber si abriste el mail.</span>
          <button type="button" onClick={() => setImagenes(true)} className="font-medium text-foreground underline underline-offset-2">
            Mostrar imágenes
          </button>
        </div>
      )}
      <iframe
        ref={frame}
        title="Texto del mail"
        srcDoc={doc}
        // Sin allow-scripts: nada del mail se ejecuta. allow-same-origin solo para medir la altura.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="block w-full border-0 bg-white"
        style={{ height: alto }}
      />
    </div>
  );
}
