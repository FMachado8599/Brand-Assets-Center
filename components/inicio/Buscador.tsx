"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, Briefcase, CornerDownLeft, Loader2, Search, SquareKanban, Target, UserRound, Wand2 } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { PerfilHost } from "@/components/perfil/PerfilDialog";
import { abrirPerfil } from "@/components/perfil/abrir";
import { FotoPerfil } from "@/components/perfil/piezas";
import { useAccount } from "@/components/shell/AccountProvider";
import { toast } from "@/components/ui/toaster";
import { useClients } from "@/hooks/useClients";
import { useEquipo } from "@/hooks/useEquipo";
import { copyEmojiText } from "@/lib/emojis/clipboard";
import { charFor, imageUrl, type EmojiEntry } from "@/lib/emojis/types";
import { empezarFoco } from "@/lib/inicio/foco";
import { registrarUso } from "@/lib/inicio/uso";
import { LIBRARY_HUB, MODULES, PERFIL, type AppModule } from "@/lib/modules";
import { fotoElegida, fueraDeOficina, nombreDe } from "@/lib/perfil";
import { fold } from "@/lib/redaccion/text";
import { cn } from "@/lib/utils";
import { useMarcaActivaId } from "./MarcaActiva";

/**
 * El buscador de toda la app (⌘K o Ctrl+K): herramientas, marcas, personas, tareas y emojis, y
 * algunas acciones (modo foco, modo marca). Se abre también desde el Inicio con abrirBuscador().
 * Lo que necesita (clientes, equipo) se lee recién al abrirlo.
 */

export const ABRIR_BUSCADOR = "app:abrir-buscador";
export const abrirBuscador = (texto = "") => window.dispatchEvent(new CustomEvent<string>(ABRIR_BUSCADOR, { detail: texto }));

const WRAPPED: AppModule = { href: "/wrapped", label: "Wrapped 2026", description: "Tu año en Herramientas", icon: Wand2 };
const HERRAMIENTAS: AppModule[] = [...MODULES.filter((m) => !m.soon), LIBRARY_HUB, PERFIL, WRAPPED];

export function Buscador() {
  const account = useAccount();
  const [abierto, setAbierto] = useState(false);
  const [inicial, setInicial] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setInicial("");
        setAbierto((v) => !v);
      }
    };
    const onPedido = (e: Event) => {
      setInicial((e as CustomEvent<string>).detail ?? "");
      setAbierto(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(ABRIR_BUSCADOR, onPedido);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(ABRIR_BUSCADOR, onPedido);
    };
  }, []);

  if (!account?.user) return null;
  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={setAbierto}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 flex max-h-[76vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">Buscar en Herramientas</DialogPrimitive.Title>
          {abierto && <Panel inicial={inicial} cerrar={() => setAbierto(false)} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      <HostDePerfil />
    </DialogPrimitive.Root>
  );
}

/** En las páginas que no tienen su propio diálogo de perfil (el Board, /perfil y el Inicio lo tienen). */
let pedirHost: (() => void) | null = null;
function HostDePerfil() {
  const pathname = usePathname();
  const [con, setCon] = useState(false);
  useEffect(() => {
    pedirHost = () => setCon(true);
    return () => {
      pedirHost = null;
    };
  }, []);
  useEffect(() => setCon(false), [pathname]);
  return con ? <PerfilHost /> : null;
}

type Resultado = {
  id: string;
  grupo: string;
  titulo: string;
  detalle?: string;
  icono: ReactNode;
  accion: () => void;
  /** Una segunda acción (con Tab o el botón de la derecha). */
  extra?: { label: string; accion: () => void };
};

function Panel({ inicial, cerrar }: { inicial: string; cerrar: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(inicial);
  const [sel, setSel] = useState(0);
  const { clients } = useClients();
  const equipo = useEquipo();
  const { setMarca, marcaId } = useMarcaActivaId();
  const [emojis, setEmojis] = useState<EmojiEntry[]>([]);
  const [tareas, setTareas] = useState<{ id: number; titulo: string; proyecto: string | null }[]>([]);
  const [buscando, setBuscando] = useState(false);
  const lista = useRef<HTMLDivElement>(null);

  const texto = fold(q.trim());

  // Emojis y tareas se buscan en la base (con un respiro entre tecla y tecla).
  useEffect(() => {
    if (texto.length < 2) {
      setEmojis([]);
      setTareas([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const [e, ta] = await Promise.all([
          fetch(`/api/emojis/search?q=${encodeURIComponent(q.trim())}&limit=8&modo=palabras`, { signal: ctl.signal })
            .then((r) => (r.ok ? r.json() : { emojis: [] }))
            .catch(() => ({ emojis: [] })),
          import("@/lib/supabase").then(({ supabase }) =>
            supabase.from("board_flujo").select("id, titulo, proyecto").eq("completada", false).ilike("titulo", `%${q.trim().replace(/[%_]/g, "")}%`).limit(6)
          ),
        ]);
        if (ctl.signal.aborted) return;
        setEmojis(((e as { emojis?: EmojiEntry[] }).emojis ?? []).slice(0, 8));
        setTareas(((ta.data ?? []) as { id: number; titulo: string; proyecto: string | null }[]).map((x) => ({ ...x, id: Number(x.id) })));
      } finally {
        if (!ctl.signal.aborted) setBuscando(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [texto, q]);

  const ir = (href: string) => {
    cerrar();
    router.push(href);
  };

  const resultados = useMemo<Resultado[]>(() => {
    const out: Resultado[] = [];
    const coincide = (...campos: (string | null | undefined)[]) => !texto || campos.some((c) => c && fold(c).includes(texto));

    for (const m of HERRAMIENTAS) {
      if (!coincide(m.label, m.description)) continue;
      const Icon = m.icon;
      out.push({ id: `h:${m.href}`, grupo: "Herramientas", titulo: m.label, detalle: m.description, icono: <Icon className="h-4 w-4" />, accion: () => ir(m.href) });
    }
    if (!texto || coincide("modo foco", "pomodoro", "concentrar")) {
      out.push({
        id: "a:foco",
        grupo: "Acciones",
        titulo: "Modo foco: 25 minutos",
        detalle: "Un pomodoro que sigue corriendo en toda la app",
        icono: <Target className="h-4 w-4" />,
        accion: () => {
          empezarFoco(25);
          cerrar();
          toast("Modo foco: 25 minutos. ¡A darle!");
        },
      });
    }
    if (marcaId && coincide("apagar modo marca", "modo marca")) {
      out.push({ id: "a:sin-marca", grupo: "Acciones", titulo: "Apagar el modo marca", icono: <Briefcase className="h-4 w-4" />, accion: () => (setMarca(null), cerrar()) });
    }

    if (texto) {
      for (const b of clients.filter((c) => coincide(c.name)).slice(0, 6)) {
        out.push({
          id: `m:${b.id}`,
          grupo: "Marcas",
          titulo: b.name,
          detalle: b.palette?.length ? b.palette.map((c) => c.hex).slice(0, 4).join(" · ") : b.color,
          icono: <ClientMark brand={b} className="h-7 w-7 rounded-lg text-[9px]" pad="p-[14%]" />,
          accion: () => ir(`/clientes/${b.id}`),
          extra: {
            label: marcaId === b.id ? "Ya está en modo marca" : "Modo marca",
            accion: () => {
              setMarca(b.id);
              cerrar();
              toast(`Modo marca: ${b.name}. Redacción, Tarjetas, Ads y Presentaciones arrancan con ella.`);
            },
          },
        });
      }
      const personas = (equipo.data?.personas ?? []).filter((p) => p.activo && coincide(nombreDe(p.perfil, p.nombre), p.email, p.cargo)).slice(0, 5);
      for (const p of personas) {
        const fuera = fueraDeOficina(p.perfil);
        out.push({
          id: `p:${p.id}`,
          grupo: "Personas",
          titulo: nombreDe(p.perfil, p.nombre),
          detalle: fuera ? "Fuera de oficina" : (p.cargo ?? p.email ?? undefined),
          icono: <FotoPerfil nombre={nombreDe(p.perfil, p.nombre)} url={fotoElegida(p.perfil, p.avatar_bc) ?? p.avatar_url} size={28} fuera={Boolean(fuera)} />,
          accion: () => {
            cerrar();
            if (!["/", "/perfil"].includes(pathname) && !pathname.startsWith("/board")) pedirHost?.();
            setTimeout(() => abrirPerfil(p.id), 30);
          },
        });
      }
      for (const t of tareas) {
        out.push({
          id: `t:${t.id}`,
          grupo: "Tareas",
          titulo: t.titulo,
          detalle: t.proyecto ?? undefined,
          icono: <SquareKanban className="h-4 w-4" />,
          accion: () => ir(`/board?tarea=${t.id}`),
        });
      }
      for (const e of emojis) {
        out.push({
          id: `e:${e.i}`,
          grupo: "Emojis",
          titulo: e.n,
          detalle: "Enter para copiar",
          // eslint-disable-next-line @next/next/no-img-element
          icono: <img src={imageUrl(e.i)} alt="" className="h-6 w-6" />,
          accion: async () => {
            const char = charFor(e, 0);
            await copyEmojiText(char);
            registrarUso("emoji", { detalle: char });
            toast(`Copiado ${char}`);
            cerrar();
          },
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, clients, equipo.data, tareas, emojis, marcaId, pathname]);

  useEffect(() => setSel(0), [texto]);
  useEffect(() => {
    lista.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(resultados.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      resultados[sel]?.accion();
    } else if (e.key === "Tab" && resultados[sel]?.extra) {
      e.preventDefault();
      resultados[sel].extra!.accion();
    }
  };

  let grupoAnterior = "";
  return (
    <>
      <div className="flex items-center gap-3 border-b px-4">
        {buscando ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : <Search className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Buscá una herramienta, una marca, una persona, una tarea o un emoji…"
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <kbd className="hidden rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground sm:block">Esc</kbd>
      </div>
      <div ref={lista} className="min-h-0 flex-1 overflow-y-auto p-2">
        {!resultados.length && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">{buscando ? "Buscando…" : "Nada con eso. Probá con otra palabra."}</p>
        )}
        {resultados.map((r, i) => {
          const titulo = r.grupo !== grupoAnterior ? r.grupo : null;
          grupoAnterior = r.grupo;
          return (
            <div key={r.id}>
              {titulo && <p className="eyebrow px-3 pb-1 pt-3">{titulo}</p>}
              <div
                data-i={i}
                role="button"
                tabIndex={-1}
                onMouseMove={() => sel !== i && setSel(i)}
                onClick={r.accion}
                className={cn(
                  "group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2",
                  i === sel ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.04]"
                )}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.05]">{r.icono}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.titulo}</span>
                  {r.detalle && <span className="block truncate text-xs text-muted-foreground">{r.detalle}</span>}
                </span>
                {r.extra && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      r.extra!.accion();
                    }}
                    className="hidden h-7 shrink-0 items-center gap-1 rounded-full border bg-card px-2.5 text-[12px] font-medium transition-colors hover:border-foreground/30 group-hover:flex"
                  >
                    {r.extra.label}
                    {i === sel && <kbd className="text-[10px] text-muted-foreground">Tab</kbd>}
                  </button>
                )}
                {i === sel && !r.extra && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                {i === sel && r.extra && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:hidden" />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 border-t px-4 py-2 text-[11px] text-muted-foreground">
        <span>
          <kbd className="font-ui">↑↓</kbd> moverse
        </span>
        <span>
          <kbd className="font-ui">Enter</kbd> abrir
        </span>
        <span>
          <kbd className="font-ui">Tab</kbd> modo marca
        </span>
        <span className="ml-auto flex items-center gap-1">
          <UserRound className="h-3 w-3" /> Solo lo del estudio
        </span>
      </div>
    </>
  );
}
