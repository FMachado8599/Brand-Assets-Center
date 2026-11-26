"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ClipboardPaste, CloudUpload, Download, FolderInput, Link2, ListPlus, SlidersHorizontal } from "lucide-react";
import { useAccount } from "@/components/shell/AccountProvider";
import { BarAction, BarButton, BarDivider, BarPopover, BarSearch, ContextBar, PanelTitle } from "@/components/shell/ContextBar";
import { toast } from "@/components/ui/toaster";
import { Hint } from "@/components/ui/tooltip";
import { useStoredState } from "@/hooks/useStoredState";
import { DriveError, getDriveToken, type DriveConfig } from "@/lib/downloads/drive.client";
import { findLinks, NO_LINKS, postName, scanLinks, type Link } from "@/lib/downloads/links";
import { registroDe, type RegistroDescarga } from "@/lib/downloads/registro";
import { anotarDescargas, saveTarget, saveToComputer, type FetchedFile } from "@/lib/downloads/save.client";
import { planTargets, zipCount } from "@/lib/downloads/targets";
import type { CoverMode, MediaFile, MediaInfo, SaveSettings } from "@/lib/downloads/types";
import { DownloadRow, type DownloadItem, type Transfer } from "./DownloadRow";
import { LinkList } from "./LinkList";
import { AUDIO_OPTIONS, COVER_OPTIONS, DESTINO_OPTIONS, ModeIcons, optionOf, type ModeOption } from "./modes";
import { PlatformIcon } from "./PlatformIcon";
import { audioCounts, DEFAULT_SETTINGS, describeSettings, SaveOptions } from "./SaveOptions";
import { useYoutubeStatus, YoutubeNotice } from "./YoutubeNotice";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

const DONE_LABEL = { compu: "Descargado", ambos: "Descargado y en Drive", drive: "En Drive" } as const;
/** Cuando lo de la compu salió en un .zip (a Drive va cada archivo por separado). */
const ZIP_LABEL = { compu: "Descargado en un .zip", ambos: "En un .zip y en Drive", drive: "En Drive" } as const;

/** Un pedazo del resumen de "Cómo se guarda": los íconos de lo elegido, con su nombre en el tooltip. */
function SummaryIcons<T extends string>({ option, children }: { option: ModeOption<T>; children?: ReactNode }) {
  return (
    <Hint label={option.label}>
      <span className="inline-flex min-w-0 items-center gap-1">
        <ModeIcons icons={option.icons} />
        {children}
      </span>
    </Hint>
  );
}

export function DownloadsShell({ drive, metricas = false }: { drive: DriveConfig | null; metricas?: boolean }) {
  const router = useRouter();
  const account = useAccount();
  const email = account?.user?.email ?? null;
  const [settings, setSettings] = useStoredState<SaveSettings>("descargas:opciones", DEFAULT_SETTINGS);
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [draft, setDraft] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const youtube = useYoutubeStatus();
  const reportYoutube = youtube.report;

  const loading = items.some((i) => i.status === "loading");
  const ready = items.filter(
    (i): i is DownloadItem & { info: MediaInfo } => i.status === "ready" && !!i.info && (i.info.files.length > 0 || !!i.info.youtube)
  );
  /** Qué bajar de los videos de una fila: lo que se eligió en ella o, si no, lo de todos. */
  const modeOf = (item: DownloadItem) => item.portada ?? settings.portada;
  // Alguna fila eligió otra cosa: "Qué bajar" de todos pasa a "Personalizado".
  const coverMixed = items.some((i) => i.portada !== undefined && i.portada !== settings.portada);
  const readyTargets = ready.flatMap((i) => planTargets(i.info, modeOf(i), { quality: i.quality }));
  const customized = settings.destino !== "compu" || settings.audio !== "con" || settings.portada !== "video" || coverMixed;

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
        // Una fila de YouTube dice si el servicio de la PC está prendido (y el aviso de arriba lo refleja al toque).
        if (link.platform === "youtube" && (res.ok || res.status === 501 || res.status === 503)) {
          reportYoutube(
            res.ok
              ? { disponible: true }
              : { disponible: false, motivo: res.status === 501 ? "sin-configurar" : "apagado", mensaje: data?.error ?? "" }
          );
        }
        if (res.ok && data) return update(link.url, { status: "ready", info: data });
        error = data?.error ?? `El servidor respondió ${res.status}.`;
        retryable = res.status >= 500 && res.status !== 501;
      } catch {}
      update(link.url, { status: "error", error, retryable });
    },
    [update, reportYoutube]
  );

  /** Elegirlo para todos pisa lo de cada fila. */
  const setCover = (portada: CoverMode) => {
    setSettings((s) => ({ ...s, portada }));
    setItems((prev) => prev.map((i) => (i.portada === undefined ? i : { ...i, portada: undefined })));
  };

  /** Una fila con lo mismo que todos deja de ser una excepción. */
  const setItemCover = (url: string, portada: CoverMode) => update(url, { portada: portada === settings.portada ? undefined : portada });

  /** Suma a la lista los links del texto; false si no había ninguno que sirva. */
  const add = useCallback(
    (text: string) => {
      const { links, ignored } = scanLinks(text);
      if (!links.length) {
        toast(ignored ? "Esos links no son de YouTube, Instagram ni Pinterest." : NO_LINKS, "error");
        return false;
      }
      const fresh = links.filter((l) => !items.some((i) => i.link.url === l.url));
      const skipped = ignored ? ` (${ignored} no ${ignored === 1 ? "es" : "son"} de YouTube, Instagram ni Pinterest)` : "";
      if (!fresh.length) toast(links.length > 1 ? "Esos links ya están en la lista" : "Ese link ya está en la lista");
      else if (fresh.length > 1 || skipped) toast(`Se ${fresh.length === 1 ? "agregó 1 link" : `agregaron ${fresh.length} links`}${skipped}`);
      setItems((prev) => [...fresh.map((link): DownloadItem => ({ link, status: "loading" })), ...prev]);
      fresh.forEach(load);
      return true;
    },
    [items, load]
  );

  // Desde el Inicio se llega con ?links=… (lo que se pegó allá): se suman al abrir, una sola vez.
  const desdeInicio = useRef(false);
  useEffect(() => {
    if (desdeInicio.current) return;
    desdeInicio.current = true;
    const params = new URLSearchParams(window.location.search);
    const texto = params.get("links");
    if (!texto) return;
    window.history.replaceState(window.history.state, "", window.location.pathname);
    add(texto);
  }, [add]);

  // Ctrl+V en cualquier parte de la página agrega los links, sin tener que enfocar nada.
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
      toast("El navegador no dejó leer el portapapeles: pegá los links con Ctrl+V.", "error");
      return;
    }
    add(text);
  };

  /* ───────────── Guardar ───────────── */

  /**
   * El permiso de Google para Drive. Va primero en el click (antes de cualquier otra espera): si no, el
   * navegador bloquea la ventana de Google. undefined si todo va solo a la compu.
   */
  const driveToken = async () => {
    if (settings.destino === "compu") return undefined;
    if (!drive) throw new DriveError("Drive no está configurado en el servidor.");
    if (!settings.carpeta) {
      setOptionsOpen(true);
      throw new DriveError("Primero pegá el link de la carpeta de Drive.");
    }
    return getDriveToken(drive, email);
  };

  /**
   * Baja lo de una fila (todo, o un archivo del carrusel) y sube a Drive lo que corresponda. Lo que va a la
   * compu lo devuelve sin guardar, para que quien llama lo guarde junto (solo o en un .zip). Si un archivo
   * falla, se queda con lo que ya bajó y con el error, para mostrarlo en la fila.
   */
  const collectItem = async (item: DownloadItem & { info: MediaInfo }, token: string | undefined, file?: MediaFile) => {
    const url = item.link.url;
    const targets = planTargets(item.info, modeOf(item), { file, quality: item.quality });
    const progress = (transfer: Transfer) => update(url, { transfer });
    const files: FetchedFile[] = [];
    // Lo que se guardó, para el registro de descargas (se anota aunque después falle otro archivo).
    const saved: RegistroDescarga[] = [];
    let driveUrl: string | undefined;
    let error: string | undefined;
    if (!targets.length) error = "Este video no tiene portada para bajar.";
    else progress({ state: "working", label: "Empezando" });

    for (const [i, target] of targets.entries()) {
      const prefix = targets.length > 1 ? `${i + 1} de ${targets.length} · ` : "";
      try {
        const result = await saveTarget(target, settings, token, (p) =>
          progress({ state: "working", label: prefix + p.label, percent: p.percent })
        );
        driveUrl = result.driveUrl;
        if (result.file) files.push(result.file);
        saved.push(registroDe(target, settings.audio, settings.destino, result.bytes));
      } catch (err) {
        if (err instanceof DriveError && err.lostFolder) setSettings((s) => ({ ...s, carpeta: null }));
        const message = err instanceof Error ? err.message : "No se pudo guardar.";
        error = targets.length > 1 ? `${prefix}${message}` : message;
        break;
      }
    }
    return { item, targets, files, saved, driveUrl, error };
  };

  type Collected = Awaited<ReturnType<typeof collectItem>>;

  /** Cómo termina una fila, una vez guardado lo suyo en la compu. */
  const finish = ({ item, targets, saved, driveUrl, error }: Collected, label: string) => {
    anotarDescargas(saved);
    update(item.link.url, {
      transfer: error
        ? { state: "error", label: error }
        : {
            state: "done",
            label,
            driveUrl: settings.destino === "compu" ? undefined : targets.length === 1 ? driveUrl : settings.carpeta?.url,
          },
    });
  };

  /** El permiso de Drive, o un aviso si no se pudo (undefined también si todo va solo a la compu). */
  const driveTokenOrToast = async (): Promise<{ token: string | undefined } | null> => {
    try {
      return { token: await driveToken() };
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo conectar con Drive.", "error");
      return null;
    }
  };

  const save = async (item: DownloadItem & { info: MediaInfo }, file?: MediaFile) => {
    const access = await driveTokenOrToast();
    if (!access) return;
    const result = await collectItem(item, access.token, file);
    try {
      if (result.files.length > 1) update(item.link.url, { transfer: { state: "working", label: "Armando el .zip" } });
      const count = await saveToComputer(result.files, postName(item.info));
      finish(result, count > 1 ? ZIP_LABEL[settings.destino] : DONE_LABEL[settings.destino]);
    } catch {
      finish({ ...result, error: result.error ?? "No se pudo armar el .zip." }, "");
    }
  };

  /** Todas las filas listas, cada una con lo suyo. A la compu va todo junto: un solo .zip (o un archivo, si es uno). */
  const saveAll = async () => {
    const access = await driveTokenOrToast();
    if (!access) return;
    const results: Collected[] = [];
    for (const item of ready) {
      const empty = !planTargets(item.info, modeOf(item), { quality: item.quality }).length;
      if (item.transfer?.state === "working" || empty) continue;
      const result = await collectItem(item, access.token);
      results.push(result);
      // Sin nada para la compu (va solo a Drive, o es un video de YouTube que ya bajó el navegador), termina acá.
      if (!result.files.length) finish(result, DONE_LABEL[settings.destino]);
      else update(item.link.url, { transfer: { state: "working", label: result.error ? "Guardando lo que bajó" : "Esperando a las demás" } });
    }
    const pending = results.filter((r) => r.files.length);
    // En el .zip, cada posteo con varios archivos va en su carpeta; los de un solo archivo, sueltos.
    const files = pending.flatMap((r) => r.files.map((f) => (r.files.length > 1 ? { ...f, folder: postName(r.item.info) } : f)));
    try {
      const count = await saveToComputer(files, `Descargas ${new Date().toLocaleDateString("es-AR").replace(/\//g, "-")}`);
      if (count > 1) toast(`${count} archivos en un .zip`);
      pending.forEach((r) => finish(r, count > 1 ? ZIP_LABEL[settings.destino] : DONE_LABEL[settings.destino]));
    } catch {
      pending.forEach((r) => finish({ ...r, error: r.error ?? "No se pudo armar el .zip." }, ""));
    }
  };

  const ActionIcon = settings.destino === "compu" ? Download : CloudUpload;
  const allHint = zipCount(readyTargets, settings.destino) > 1 ? "Descargar todo en un .zip" : "Descargar todo";

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
        <BarPopover label="Pegar varios links" icon={ListPlus} className="w-[22rem]" open={listOpen} onOpenChange={setListOpen}>
          <PanelTitle title="Pegar varios links" hint="Un mensaje, una lista, lo que tengas: entra un link por fila." />
          <LinkList
            autoFocus
            onAdd={(text) => {
              const added = add(text);
              if (added) setListOpen(false);
              return added;
            }}
          />
        </BarPopover>
        <BarPopover
          label="Cómo se guarda"
          icon={SlidersHorizontal}
          highlight={customized}
          className="w-80"
          align="end"
          open={optionsOpen}
          onOpenChange={setOptionsOpen}
          focusPanel
        >
          <SaveOptions
            settings={settings}
            onChange={setSettings}
            onCover={setCover}
            coverMixed={coverMixed}
            drive={drive}
            email={email}
          />
        </BarPopover>
        {metricas && <BarButton label="Métricas: quién baja qué" icon={BarChart3} onClick={() => router.push("/descargas/metricas")} />}
        {ready.length > 1 && readyTargets.length > 0 && (
          <>
            <BarDivider />
            <Hint label={allHint}>
              <BarAction label={allHint} icon={ActionIcon} onClick={saveAll}>
                Descargar todo
              </BarAction>
            </Hint>
          </>
        )}
      </ContextBar>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-[6.5rem] sm:px-6">
        <div className="mb-6 text-center">
          <h1 className="font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">Descargas</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Pegá links de YouTube, Instagram o Pinterest y bajá los videos, sus portadas y las fotos en la mejor
            calidad que tengan: a tu compu, a una carpeta de Drive o a las dos.
          </p>
          <button
            type="button"
            onClick={() => setOptionsOpen(true)}
            aria-label={`Cómo se guarda: ${describeSettings(settings, coverMixed)}. Cambiar`}
            className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs font-medium transition-colors hover:border-foreground/30"
          >
            <SummaryIcons option={optionOf(DESTINO_OPTIONS, settings.destino)}>
              {settings.destino !== "compu" && <span className="truncate">{settings.carpeta?.name ?? "falta la carpeta"}</span>}
            </SummaryIcons>
            <span aria-hidden className="text-muted-foreground/60">·</span>
            {coverMixed ? <span>Personalizado</span> : <SummaryIcons option={optionOf(COVER_OPTIONS, settings.portada)} />}
            {audioCounts(settings, coverMixed) && (
              <>
                <span aria-hidden className="text-muted-foreground/60">·</span>
                <SummaryIcons option={optionOf(AUDIO_OPTIONS, settings.audio)} />
              </>
            )}
            <span className="shrink-0 text-muted-foreground">· Cambiar</span>
          </button>
        </div>

        <YoutubeNotice status={youtube.status} checking={youtube.checking} onCheck={youtube.check} />

        {items.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-foreground/10 bg-card/80 p-4 shadow-sm sm:p-6">
            <LinkList onAdd={add} onPasteClipboard={pasteFromClipboard} />
            <p className="mt-3 text-center text-xs text-muted-foreground">o apretá Ctrl+V en cualquier parte de la página</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <ul className="divide-y">
              {items.map((item) => (
                <DownloadRow
                  key={item.link.url}
                  item={item}
                  settings={settings}
                  mode={modeOf(item)}
                  onSave={(file) => item.info && save(item as DownloadItem & { info: MediaInfo }, file)}
                  onCover={(portada) => setItemCover(item.link.url, portada)}
                  onQuality={(quality) => update(item.link.url, { quality })}
                  onRetry={() => load(item.link)}
                  onRemove={() => setItems((prev) => prev.filter((i) => i.link.url !== item.link.url))}
                />
              ))}
            </ul>
            {items.length > 1 && (
              <div className="flex items-center gap-2 border-t bg-secondary/40 px-4 py-2.5">
                <span className="text-xs tabular-nums text-muted-foreground">{items.length} links</span>
                {!loading && !items.some((i) => i.transfer?.state === "working") && (
                  <button
                    type="button"
                    onClick={() => setItems([])}
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
                  >
                    Vaciar
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-2">
          {[
            {
              icon: <PlatformIcon platform="youtube" />,
              title: "YouTube",
              text: "Hasta 1080p, con o sin audio, o solo el audio. Lo baja la PC de la oficina.",
              off: youtube.status?.disponible === false,
            },
            { icon: <PlatformIcon platform="instagram" />, title: "Instagram", text: "Reels, videos, fotos y carruseles enteros, de cuentas públicas." },
            { icon: <PlatformIcon platform="pinterest" />, title: "Pinterest", text: "Videos e imágenes en su tamaño original, también con links pin.it." },
            { icon: <FolderInput className="h-4 w-4" />, title: "Directo a Drive", text: "Pegás el link de una carpeta y lo que bajes se guarda ahí." },
          ].map((f) => (
            <li key={f.title} className="rounded-2xl border bg-card/80 p-4">
              <span className="mb-2 flex">{f.icon}</span>
              <p className="flex items-center gap-2 font-medium">
                {f.title}
                {"off" in f && f.off && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
                    Apagado ahora
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{f.text}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
