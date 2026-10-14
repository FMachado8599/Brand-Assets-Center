"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardPaste, Download, Instagram, Layers, Link2, Pin } from "lucide-react";
import { BarAction, BarButton, BarDivider, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { toast } from "@/components/ui/toaster";
import { findLinks, NO_LINKS, type Link } from "@/lib/downloads/links";
import type { MediaInfo } from "@/lib/downloads/types";
import { DownloadRow, saveAll, type DownloadItem } from "./DownloadRow";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function DownloadsShell() {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const loading = items.some((i) => i.status === "loading");
  const ready = items.filter((i): i is DownloadItem & { info: MediaInfo } => i.status === "ready" && !!i.info?.files.length);
  const readyFiles = ready.flatMap(({ info }) => info.files.map((file) => ({ info, file })));

  const update = useCallback((url: string, patch: Partial<DownloadItem>) => {
    setItems((prev) => prev.map((i) => (i.link.url === url ? { ...i, ...patch } : i)));
  }, []);

  const load = useCallback(
    async (link: Link) => {
      update(link.url, { status: "loading", error: undefined });
      let error = "No me pude conectar con el servidor. Revisá tu conexión.";
      let retryable = true;
      try {
        const res = await fetch(`/api/descargas/info?url=${encodeURIComponent(link.url)}`);
        const data = await res.json().catch(() => null);
        if (res.ok && data) return update(link.url, { status: "ready", info: data });
        error = data?.error ?? `El servidor respondió ${res.status}.`;
        retryable = res.status >= 500 && res.status !== 501;
      } catch {}
      update(link.url, { status: "error", error, retryable });
    },
    [update]
  );

  /** Suma a la lista los links del texto; false si no había ninguno que sirva. */
  const add = useCallback(
    (text: string) => {
      const links = findLinks(text);
      if (!links.length) {
        toast(NO_LINKS, "error");
        return false;
      }
      const fresh = links.filter((l) => !items.some((i) => i.link.url === l.url));
      if (!fresh.length) toast(links.length > 1 ? "Esos links ya están en la lista" : "Ese link ya está en la lista");
      setItems((prev) => [...fresh.map((link): DownloadItem => ({ link, status: "loading" })), ...prev]);
      fresh.forEach(load);
      return true;
    },
    [items, load]
  );

  // Ctrl+V en cualquier parte de la página agrega el link, sin tener que enfocar nada.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const inBar = e.target === inputRef.current;
      if (!inBar && isTyping(e.target)) return;
      const text = e.clipboardData?.getData("text") ?? "";
      // En la barra, un texto sin links se deja pegar para poder corregirlo a mano.
      if (!text.trim() || (inBar && !findLinks(text).length)) return;
      e.preventDefault();
      if (add(text) && inBar) setDraft("");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  const submitDraft = () => {
    if (draft.trim() && add(draft)) setDraft("");
  };

  const pasteFromClipboard = async () => {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast("El navegador no dejó leer el portapapeles: pegá el link con Ctrl+V.", "error");
      return;
    }
    add(text);
  };

  return (
    <div className="min-h-screen">
      <ContextBar>
        <BarSearch
          ref={inputRef}
          icon={Link2}
          value={draft}
          onChange={setDraft}
          onEnter={submitDraft}
          placeholder="Pegá un link"
          busy={loading}
        />
        <BarButton label="Pegar del portapapeles" icon={ClipboardPaste} onClick={pasteFromClipboard} />
        {ready.length > 1 && (
          <>
            <BarDivider />
            <BarAction label="Descargar todo" icon={Download} onClick={() => saveAll(readyFiles)}>
              Descargar {readyFiles.length}
            </BarAction>
          </>
        )}
      </ContextBar>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-6 text-center">
          <h1 className="font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">Descargas</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Pegá el link de un posteo de Instagram o de un pin de Pinterest y bajá los videos y las fotos en la mejor
            calidad que tengan.
          </p>
        </div>

        {items.length === 0 ? (
          <button
            type="button"
            onClick={pasteFromClipboard}
            className="flex w-full flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-foreground/10 bg-card/80 px-6 py-14 text-center shadow-sm transition-colors hover:border-primary"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/25">
              <Link2 className="h-6 w-6" />
            </span>
            <span className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm">
              <ClipboardPaste className="h-4 w-4" /> Pegar link
            </span>
            <span className="text-sm text-muted-foreground">o apretá Ctrl+V en cualquier parte de la página</span>
          </button>
        ) : (
          <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <ul className="divide-y">
              {items.map((item) => (
                <DownloadRow
                  key={item.link.url}
                  item={item}
                  onRetry={() => load(item.link)}
                  onRemove={() => setItems((prev) => prev.filter((i) => i.link.url !== item.link.url))}
                />
              ))}
            </ul>
            {items.length > 1 && (
              <div className="flex items-center gap-2 border-t bg-secondary/40 px-4 py-2.5">
                <span className="text-xs tabular-nums text-muted-foreground">{items.length} links</span>
                {!loading && (
                  <button
                    type="button"
                    onClick={() => setItems([])}
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-foreground/80 hover:bg-black/5"
                  >
                    Vaciar
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
          {[
            { icon: Instagram, title: "Instagram", text: "Reels, videos, fotos y carruseles enteros, de cuentas públicas." },
            { icon: Pin, title: "Pinterest", text: "Videos e imágenes en su tamaño original, también con links pin.it." },
            { icon: Layers, title: "Varios a la vez", text: "Pegá un mensaje con varios links y entra uno por fila." },
          ].map((f) => (
            <li key={f.title} className="rounded-2xl border bg-card/80 p-4">
              <f.icon className="mb-2 h-4 w-4" />
              <p className="font-medium">{f.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{f.text}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
