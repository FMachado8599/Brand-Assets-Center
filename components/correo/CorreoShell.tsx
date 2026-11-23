"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertOctagon,
  Archive,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  Inbox,
  Loader2,
  LogOut,
  Paperclip,
  PenSquare,
  RefreshCw,
  Reply,
  Send,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { BarAction, BarButton, BarDivider, BarSearch, ContextBar } from "@/components/shell/ContextBar";
import { useAccount } from "@/components/shell/AccountProvider";
import { useConfirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { useDebounced } from "@/hooks/useDebounced";
import { api, borradorDe, ErrorCorreo, fechaCorta, jsonInit, type Borrador } from "@/lib/correo/cliente";
import {
  nombreDireccion,
  type AccionMensaje,
  type Carpeta,
  type EstadoCarpeta,
  type EstadoCuenta,
  type ListaMensajes,
  type Mensaje,
  type MensajeResumen,
  type ModoEnvio,
  type TipoCarpeta,
} from "@/lib/correo/types";
import { cn } from "@/lib/utils";
import { Conectar, Marco } from "./Conectar";
import { Redactar } from "./Redactar";
import { VistaMensaje } from "./VistaMensaje";

/**
 * /correo: la casilla @camaratbwa.com de cada uno. Sin casilla conectada, pide la contraseña del correo;
 * con casilla, la bandeja: carpetas, la lista y el mail abierto. No hay copia de los mails en la app:
 * todo se pide al servidor de correo, así que lo de acá y lo de Outlook es lo mismo.
 */
export function CorreoShell() {
  const account = useAccount();
  const user = account?.user ?? null;
  const [estado, setEstado] = useState<EstadoCuenta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Correo · Herramientas";
  }, []);

  const cargarEstado = useCallback(async () => {
    try {
      setEstado(await api<EstadoCuenta>("/api/correo/cuenta"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (account?.ready && user) cargarEstado();
  }, [account?.ready, user, cargarEstado]);

  // La contraseña guardada dejó de andar (la cambiaron en el servidor): se vuelve a pedir.
  const pedirClave = useCallback((mensaje: string) => {
    setAviso(`${mensaje} Si cambiaste la contraseña del correo, poné la nueva.`);
    setEstado((e) => (e ? { ...e, conectada: false } : e));
  }, []);

  const titulo = (
    <span className="px-2 text-sm font-semibold tracking-tight text-cream">Correo</span>
  );

  if (!account?.ready || (user && !estado && !error)) {
    return (
      <>
        <ContextBar>{titulo}</ContextBar>
        <main className="mx-auto flex h-[100dvh] max-w-[1500px] gap-3 px-3 pb-3 pt-[4.75rem] sm:px-4">
          <div className="skeleton hidden w-52 rounded-[1.5rem] lg:block" />
          <div className="skeleton w-full rounded-[1.5rem] md:w-[24rem]" />
          <div className="skeleton hidden flex-1 rounded-[1.5rem] md:block" />
        </main>
      </>
    );
  }

  if (!user || !estado) {
    return (
      <>
        <ContextBar>{titulo}</ContextBar>
        <Marco>
          <h1 className="mt-3 font-display text-4xl">{user ? "No pudimos abrir el correo" : "Iniciá sesión"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{user ? error : "Entrá con tu cuenta del estudio para ver tu correo."}</p>
        </Marco>
      </>
    );
  }

  if (!estado.conectada) {
    return (
      <>
        <ContextBar>{titulo}</ContextBar>
        <Conectar
          estado={estado}
          aviso={aviso}
          onConectada={() => {
            setAviso(null);
            toast("Casilla conectada");
            cargarEstado();
          }}
        />
      </>
    );
  }

  return <Bandeja estado={estado} titulo={titulo} onPideClave={pedirClave} onDesconectada={cargarEstado} />;
}

/* ───────────── La bandeja ───────────── */

const ICONOS: Record<TipoCarpeta, LucideIcon> = {
  inbox: Inbox,
  drafts: FileText,
  sent: Send,
  archive: Archive,
  junk: AlertOctagon,
  trash: Trash2,
  otra: Folder,
};

/** Cada cuánto se mira si llegó algo (solo con la pestaña a la vista). */
const CADA = 60_000;

function Bandeja({
  estado,
  titulo,
  onPideClave,
  onDesconectada,
}: {
  estado: EstadoCuenta;
  titulo: React.ReactNode;
  onPideClave: (mensaje: string) => void;
  onDesconectada: () => void;
}) {
  const confirm = useConfirm();
  const yo = estado.email ?? "";
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [carpeta, setCarpeta] = useState("INBOX");
  const [pagina, setPagina] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [q] = useDebounced(busqueda.trim(), 450);
  const [lista, setLista] = useState<ListaMensajes | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [cargandoMensaje, setCargandoMensaje] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const pedidoLista = useRef(0);
  const pedidoMensaje = useRef(0);
  const ultimo = useRef<EstadoCarpeta | null>(null);

  const actual = carpetas.find((c) => c.path === carpeta);
  const enviados = actual?.tipo === "sent" || actual?.tipo === "drafts";

  /** Los errores de la casilla: si es la contraseña, se vuelve a pedir; si no, se muestra. */
  const fallo = useCallback(
    (e: unknown, mostrar: (m: string) => void) => {
      if (e instanceof ErrorCorreo && (e.codigo === "auth" || e.codigo === "sin_cuenta")) onPideClave(e.message);
      else mostrar((e as Error).message);
    },
    [onPideClave]
  );

  const cargarCarpetas = useCallback(async () => {
    try {
      setCarpetas((await api<{ carpetas: Carpeta[] }>("/api/correo/carpetas")).carpetas);
    } catch (e) {
      fallo(e, (m) => toast(m, "error"));
    }
  }, [fallo]);

  const cargarLista = useCallback(
    async (silencioso = false) => {
      const n = ++pedidoLista.current;
      if (!silencioso) setCargando(true);
      try {
        const params = new URLSearchParams({ carpeta, pagina: String(pagina) });
        if (q) params.set("q", q);
        const r = await api<ListaMensajes>(`/api/correo/mensajes?${params}`);
        if (n !== pedidoLista.current) return;
        setLista(r);
        setError(null);
      } catch (e) {
        if (n === pedidoLista.current) fallo(e, setError);
      } finally {
        if (n === pedidoLista.current) setCargando(false);
      }
    },
    [carpeta, pagina, q, fallo]
  );

  useEffect(() => {
    cargarCarpetas();
  }, [cargarCarpetas]);

  useEffect(() => {
    cargarLista();
  }, [cargarLista]);

  // Cambiar de carpeta o de búsqueda vuelve a la primera página.
  useEffect(() => setPagina(0), [carpeta, q]);
  useEffect(() => {
    ultimo.current = null;
    setAbierto(null);
    setMensaje(null);
  }, [carpeta]);

  // El tipo de la carpeta abierta, para el aviso de "llegó un mail" (solo en Recibidos).
  const actualTipo = useRef<TipoCarpeta | undefined>(undefined);
  actualTipo.current = actual?.tipo;

  // ¿Llegó algo? Se mira la carpeta abierta cada minuto (y al volver a la pestaña).
  useEffect(() => {
    let vivo = true;
    const mirar = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const e = await api<EstadoCarpeta>(`/api/correo/estado?carpeta=${encodeURIComponent(carpeta)}`);
        if (!vivo) return;
        const antes = ultimo.current;
        ultimo.current = e;
        if (!antes || antes.carpeta !== e.carpeta) return;
        if (antes.uidNext !== e.uidNext || antes.total !== e.total || antes.noLeidos !== e.noLeidos) {
          if (e.uidNext > antes.uidNext && actualTipo.current === "inbox") toast(e.uidNext - antes.uidNext > 1 ? "Llegaron mails nuevos" : "Llegó un mail nuevo");
          cargarCarpetas();
          if (pagina === 0 && !q) cargarLista(true);
        }
      } catch {
        /* sin red un rato: se vuelve a probar en el próximo */
      }
    };
    mirar();
    const t = setInterval(mirar, CADA);
    const alVolver = () => document.visibilityState === "visible" && mirar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [carpeta, pagina, q, cargarCarpetas, cargarLista]);

  const cambiarEnLista = (uids: number[], cambio: Partial<MensajeResumen>) =>
    setLista((l) => (l ? { ...l, mensajes: l.mensajes.map((m) => (uids.includes(m.uid) ? { ...m, ...cambio } : m)) } : l));

  const sumarNoLeidos = (delta: number) =>
    setCarpetas((cs) => cs.map((c) => (c.path === carpeta ? { ...c, noLeidos: Math.max(0, c.noLeidos + delta) } : c)));

  async function abrir(m: MensajeResumen) {
    const n = ++pedidoMensaje.current;
    setAbierto(m.uid);
    setMensaje(null);
    setErrorMensaje(null);
    setCargandoMensaje(true);
    try {
      const r = await api<Mensaje>(`/api/correo/mensaje?carpeta=${encodeURIComponent(carpeta)}&uid=${m.uid}`);
      if (n !== pedidoMensaje.current) return;
      setMensaje(r);
      if (!m.leido) {
        cambiarEnLista([m.uid], { leido: true });
        sumarNoLeidos(-1);
      }
    } catch (e) {
      if (n === pedidoMensaje.current) fallo(e, setErrorMensaje);
    } finally {
      if (n === pedidoMensaje.current) setCargandoMensaje(false);
    }
  }

  async function accion(a: AccionMensaje, uid: number) {
    const m = lista?.mensajes.find((x) => x.uid === uid);
    const sale = a === "archivar" || a === "papelera" || a === "mover";
    if (a === "papelera" && actual?.tipo === "trash") {
      const ok = await confirm({ title: "¿Borrar para siempre?", description: "Ya está en la Papelera: no se puede recuperar.", confirmLabel: "Borrar", destructive: true });
      if (!ok) return;
    }
    // Se ve al toque; si el servidor dice que no, se vuelve a pedir la lista.
    if (sale) {
      setLista((l) => (l ? { ...l, total: Math.max(0, l.total - 1), mensajes: l.mensajes.filter((x) => x.uid !== uid) } : l));
      if (m && !m.leido) sumarNoLeidos(-1);
      if (abierto === uid) {
        setAbierto(null);
        setMensaje(null);
      }
    } else if (a === "leido" || a === "no_leido") {
      cambiarEnLista([uid], { leido: a === "leido" });
      if (m && m.leido !== (a === "leido")) sumarNoLeidos(a === "leido" ? -1 : 1);
      if (a === "no_leido" && abierto === uid) {
        setAbierto(null);
        setMensaje(null);
      }
    } else {
      const destacado = a === "destacar";
      cambiarEnLista([uid], { destacado });
      setMensaje((x) => (x && x.uid === uid ? { ...x, destacado } : x));
    }
    try {
      await api("/api/correo/mensaje", jsonInit("PATCH", { carpeta, uids: [uid], accion: a }));
      if (a === "archivar") toast("Archivado");
      if (a === "papelera") toast(actual?.tipo === "trash" ? "Borrado" : "A la Papelera");
      if (sale) cargarCarpetas();
    } catch (e) {
      fallo(e, (msg) => toast(msg, "error"));
      cargarLista(true);
      cargarCarpetas();
    }
  }

  function responder(modo: ModoEnvio) {
    setBorrador(borradorDe(modo, yo, carpeta, modo === "nuevo" ? null : mensaje));
  }

  async function desconectar() {
    const ok = await confirm({
      title: "¿Desconectar tu casilla?",
      description: "Se borra la contraseña guardada. Tus mails no se tocan: siguen en el servidor y en Outlook.",
      confirmLabel: "Desconectar",
    });
    if (!ok) return;
    try {
      await api("/api/correo/cuenta", { method: "DELETE" });
      toast("Casilla desconectada");
      onDesconectada();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const total = lista?.total ?? 0;
  const porPagina = lista?.porPagina ?? 50;
  const desde = total ? pagina * porPagina + 1 : 0;
  const hasta = Math.min(total, (pagina + 1) * porPagina);
  const noLeidosInbox = carpetas.find((c) => c.tipo === "inbox")?.noLeidos ?? 0;

  return (
    <>
      <ContextBar>
        {titulo}
        <BarDivider />
        <BarSearch value={busqueda} onChange={setBusqueda} placeholder={`Buscar en ${actual?.nombre ?? "la carpeta"}…`} busy={cargando && Boolean(q)} />
        <BarButton
          label="Actualizar"
          icon={RefreshCw}
          onClick={() => {
            cargarCarpetas();
            cargarLista();
          }}
          className="hidden sm:grid"
        />
        <BarButton label="Desconectar tu casilla" icon={LogOut} onClick={desconectar} className="hidden sm:grid" />
        <BarDivider />
        <BarAction label="Redactar" icon={PenSquare} onClick={() => responder("nuevo")} />
      </ContextBar>

      <main className="mx-auto flex h-[100dvh] max-w-[1500px] gap-3 px-3 pb-3 pt-[4.75rem] sm:px-4">
        {/* Carpetas (en pantallas chicas van arriba de la lista) */}
        <nav aria-label="Carpetas" className="hidden w-52 shrink-0 flex-col overflow-y-auto lg:flex">
          <p className="truncate px-3 pb-2 pt-1 text-xs text-muted-foreground" title={yo}>
            {yo}
          </p>
          {carpetas.map((c) => (
            <BotonCarpeta key={c.path} c={c} activa={c.path === carpeta} onClick={() => setCarpeta(c.path)} />
          ))}
          {!carpetas.length && <div className="skeleton mx-1 h-40 rounded-2xl" />}
        </nav>

        <section
          aria-label="Mails"
          className={cn(
            "flex min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-black/[0.06] bg-card shadow-[0_1px_2px_hsl(40_30%_20%/0.04)] md:w-[22rem] md:shrink-0 xl:w-[26rem]",
            abierto ? "max-md:hidden" : "max-md:flex-1"
          )}
        >
          <div className="flex gap-1.5 overflow-x-auto border-b px-3 py-2 lg:hidden">
            {carpetas.map((c) => (
              <button
                key={c.path}
                type="button"
                onClick={() => setCarpeta(c.path)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px]",
                  c.path === carpeta ? "border-ink bg-ink text-cream" : "bg-card text-muted-foreground"
                )}
              >
                {c.nombre}
                {c.noLeidos > 0 && <span className="font-semibold">{c.noLeidos}</span>}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold">{q ? `“${q}” en ${actual?.nombre ?? ""}` : actual?.nombre ?? "Recibidos"}</h1>
              <p className="text-xs text-muted-foreground">
                {cargando && !lista ? "Cargando…" : total ? `${desde}–${hasta} de ${total}` : q ? "Nada encontrado" : "Vacía"}
                {!q && actual?.tipo === "inbox" && noLeidosInbox > 0 && ` · ${noLeidosInbox} sin leer`}
              </p>
            </div>
            <div className="flex shrink-0 items-center">
              {cargando && lista && <Loader2 className="mr-1 h-4 w-4 animate-spin text-muted-foreground" />}
              <Paginar label="Más nuevos" icon={ChevronLeft} disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} />
              <Paginar label="Más viejos" icon={ChevronRight} disabled={hasta >= total} onClick={() => setPagina((p) => p + 1)} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {error ? (
              <div className="p-6 text-center text-sm">
                <p className="text-destructive">{error}</p>
                <button type="button" onClick={() => cargarLista()} className="mt-3 font-medium underline underline-offset-2">
                  Probar de nuevo
                </button>
              </div>
            ) : !lista ? (
              <div className="space-y-px p-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="skeleton h-16 rounded-xl" />
                ))}
              </div>
            ) : lista.mensajes.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">{q ? "No hay mails con eso." : "No hay mails acá."}</p>
            ) : (
              <ul>
                {lista.mensajes.map((m) => (
                  <Fila key={m.uid} m={m} activa={m.uid === abierto} enviados={enviados} onClick={() => abrir(m)} />
                ))}
              </ul>
            )}
          </div>
        </section>

        <section
          aria-label="Mail abierto"
          className={cn(
            "min-w-0 flex-1 overflow-hidden rounded-[1.5rem] border border-black/[0.06] bg-card shadow-[0_1px_2px_hsl(40_30%_20%/0.04)]",
            !abierto && "max-md:hidden"
          )}
        >
          <VistaMensaje
            carpeta={carpeta}
            mensaje={abierto ? mensaje : null}
            cargando={cargandoMensaje}
            error={abierto ? errorMensaje : null}
            enPapelera={actual?.tipo === "trash"}
            onVolver={() => {
              setAbierto(null);
              setMensaje(null);
            }}
            onResponder={responder}
            onAccion={(a) => abierto && accion(a, abierto)}
          />
        </section>
      </main>

      <Redactar
        borrador={borrador}
        onClose={() => setBorrador(null)}
        onEnviado={() => {
          setBorrador(null);
          cargarCarpetas();
          if (enviados || borrador?.original) cargarLista(true);
        }}
      />
    </>
  );
}

function BotonCarpeta({ c, activa, onClick }: { c: Carpeta; activa: boolean; onClick: () => void }) {
  const Icon = ICONOS[c.tipo];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? "page" : undefined}
      style={{ paddingLeft: `${0.75 + c.nivel * 0.9}rem` }}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-full pr-3 text-left text-sm transition-colors",
        activa ? "bg-ink text-cream" : "text-foreground/80 hover:bg-black/[0.05]"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", activa ? "text-cream" : "text-muted-foreground")} />
      <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
      {c.noLeidos > 0 && <span className={cn("text-xs font-semibold tabular-nums", !activa && "text-foreground")}>{c.noLeidos}</span>}
    </button>
  );
}

function Fila({ m, activa, enviados, onClick }: { m: MensajeResumen; activa: boolean; enviados: boolean; onClick: () => void }) {
  const quien = enviados ? m.para : m.de;
  const nombre = quien.length ? quien.map(nombreDireccion).join(", ") : "—";
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={activa ? "true" : undefined}
        className={cn(
          "relative flex w-full gap-2.5 border-b border-black/[0.05] px-4 py-3 text-left transition-colors",
          activa ? "bg-primary/20" : "hover:bg-black/[0.03]"
        )}
      >
        <span aria-hidden className={cn("mt-[7px] h-2 w-2 shrink-0 rounded-full", m.leido ? "bg-transparent" : "bg-primary ring-1 ring-ink/20")} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-sm", !m.leido && "font-semibold")}>
              {enviados && <span className="text-muted-foreground">Para: </span>}
              {nombre}
            </span>
            <span className={cn("shrink-0 text-xs tabular-nums", m.leido ? "text-muted-foreground" : "font-semibold")}>{fechaCorta(m.fecha)}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span className={cn("min-w-0 flex-1 truncate text-[13px]", m.leido ? "text-muted-foreground" : "font-medium text-foreground")}>
              {m.asunto || "(Sin asunto)"}
            </span>
            {m.respondido && <Reply aria-label="Respondido" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {m.adjuntos && <Paperclip aria-label="Tiene adjuntos" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {m.destacado && <Star aria-label="Destacado" className="h-3.5 w-3.5 shrink-0 fill-primary text-ink" />}
          </span>
        </span>
      </button>
    </li>
  );
}

function Paginar({ label, icon: Icon, disabled, onClick }: { label: string; icon: LucideIcon; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
