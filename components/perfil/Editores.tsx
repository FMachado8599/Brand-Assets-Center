"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pipette, Plane, Smile, Trash2, Upload, X } from "lucide-react";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { Hint } from "@/components/ui/tooltip";
import { borrarFoto, subirFoto } from "@/hooks/useMiPerfil";
import {
  ACENTOS,
  EMOJIS_ESTADO,
  ESTADOS_RAPIDOS,
  FOTO_ACCEPT,
  VENCIMIENTOS,
  estadoVigente,
  fechaCorta,
  fueraDeOficina,
  hoyISO,
  linkDeRed,
  recortarFoto,
  REDES_PERFIL,
  textoDeRed,
  textoVence,
  urlFotoSubida,
  type FotoOrigen,
  type Perfil,
  type PerfilPatch,
  type RedPerfil,
} from "@/lib/perfil";
import { cn } from "@/lib/utils";
import { FotoPerfil, RedIcon } from "./piezas";

type Guardar = (patch: PerfilPatch, ok?: string) => Promise<boolean>;

const DEMORA = 700;

/** Un texto que se guarda solo, un rato después de dejar de escribir (y al salir del campo). */
function useGuardadoDemorado(guardar: (valor: string) => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pendiente = useRef<string | null>(null);
  const ref = useRef(guardar);
  ref.current = guardar;
  const flush = () => {
    clearTimeout(timer.current);
    if (pendiente.current === null) return;
    const v = pendiente.current;
    pendiente.current = null;
    ref.current(v);
  };
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    cambiar(valor: string) {
      pendiente.current = valor;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, DEMORA);
    },
    flush,
  };
}

/* ───────────── Estado ───────────── */

/**
 * El estado: emoji + texto (o uno de los rápidos), cuándo se borra solo y "fuera de oficina hasta…".
 * Cada cambio se guarda al momento; el texto, al dejar de escribir.
 */
export function EstadoEditor({ perfil, guardar, disabled }: { perfil: Perfil; guardar: Guardar; disabled?: boolean }) {
  const vigente = estadoVigente(perfil);
  const [emoji, setEmoji] = useState(vigente?.emoji ?? "");
  const [texto, setTexto] = useState(vigente?.texto ?? "");
  const fuera = fueraDeOficina(perfil);
  const [fueraAbierto, setFueraAbierto] = useState(Boolean(fuera));
  const fecha = useRef<HTMLInputElement>(null);
  /** Abre el calendario del campo de fecha (donde el navegador lo permite). */
  const abrirCalendario = () =>
    setTimeout(() => {
      try {
        fecha.current?.showPicker?.();
      } catch {
        fecha.current?.focus();
      }
    }, 50);

  // Si se venció mientras la página estaba abierta (o se borró desde otro lado), se limpia el campo.
  useEffect(() => {
    if (!vigente) {
      setEmoji("");
      setTexto("");
    }
  }, [Boolean(vigente)]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Un estado nuevo sobre uno vencido arranca sin vencimiento (si no, nacería vencido). */
  const sinVencido = (): PerfilPatch =>
    perfil.estado_vence && new Date(perfil.estado_vence).getTime() <= Date.now() ? { estado_vence: null } : {};

  const textoDemorado = useGuardadoDemorado((v) => guardar({ estado_texto: v.trim() || null, ...sinVencido() }));

  const elegirEmoji = (e: string) => {
    setEmoji(e);
    guardar({ estado_emoji: e || null, ...sinVencido() });
  };

  const rapido = (r: (typeof ESTADOS_RAPIDOS)[number]) => {
    setEmoji(r.emoji);
    setTexto(r.texto);
    const vence = VENCIMIENTOS.find((v) => v.value === r.vence)?.desde(new Date()) ?? null;
    guardar({ estado_emoji: r.emoji, estado_texto: r.texto, estado_vence: vence?.toISOString() ?? null }, `Estado: ${r.emoji} ${r.texto}`);
    if (r.fuera && !fuera) {
      setFueraAbierto(true);
      abrirCalendario();
      toast("Elegí hasta cuándo estás fuera de oficina");
    }
  };

  const borrar = () => {
    setEmoji("");
    setTexto("");
    guardar({ estado_emoji: null, estado_texto: null, estado_vence: null }, "Estado borrado");
  };

  const hay = Boolean(emoji || texto);
  const venceValor = !perfil.estado_vence ? "nunca" : "";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Elegir el emoji del estado"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border bg-card text-xl shadow-sm transition-colors hover:border-foreground/30 disabled:opacity-50"
            >
              {emoji || <Smile className="h-5 w-5 text-muted-foreground" />}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[17.5rem]">
            <div className="grid grid-cols-8 gap-1">
              {EMOJIS_ESTADO.map((e) => (
                <PopoverClose asChild key={e}>
                  <button
                    type="button"
                    onClick={() => elegirEmoji(e)}
                    className={cn("grid h-8 w-8 place-items-center rounded-lg text-lg transition-colors hover:bg-secondary", e === emoji && "bg-secondary ring-1 ring-foreground/20")}
                  >
                    {e}
                  </button>
                </PopoverClose>
              ))}
            </div>
            {emoji && (
              <PopoverClose asChild>
                <button type="button" onClick={() => elegirEmoji("")} className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">
                  Sin emoji
                </button>
              </PopoverClose>
            )}
          </PopoverContent>
        </Popover>
        <input
          value={texto}
          disabled={disabled}
          maxLength={80}
          onChange={(e) => {
            setTexto(e.target.value);
            textoDemorado.cambiar(e.target.value);
          }}
          onBlur={textoDemorado.flush}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), textoDemorado.flush())}
          placeholder="¿En qué andás?"
          aria-label="Tu estado"
          className="h-11 min-w-0 flex-1 rounded-2xl border bg-card px-4 text-[15px] shadow-sm outline-none transition-colors focus:border-foreground/40 disabled:opacity-50"
        />
        {hay && (
          <Hint label="Borrar el estado">
            <button type="button" onClick={borrar} disabled={disabled} aria-label="Borrar el estado" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </Hint>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ESTADOS_RAPIDOS.map((r) => {
          const activo = emoji === r.emoji && texto === r.texto;
          return (
            <button
              key={r.texto}
              type="button"
              disabled={disabled}
              onClick={() => rapido(r)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-50",
                activo ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/30"
              )}
            >
              <span className="text-[15px] leading-none">{r.emoji}</span> {r.texto}
            </button>
          );
        })}
      </div>

      {hay && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">{textoVence(perfil.estado_vence)}</span>
          <Select
            value={venceValor}
            disabled={disabled}
            onValueChange={(v) => {
              const vence = VENCIMIENTOS.find((x) => x.value === v)?.desde(new Date()) ?? null;
              guardar({ estado_vence: vence?.toISOString() ?? null });
            }}
          >
            <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full px-3 text-[13px]">
              <SelectValue placeholder="Cambiar" />
            </SelectTrigger>
            <SelectContent>
              {VENCIMIENTOS.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className={cn("rounded-2xl border p-4 transition-colors", fueraAbierto ? "border-amber-300 bg-amber-50" : "bg-card")}>
        <div className="flex items-center gap-3">
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", fueraAbierto ? "bg-amber-400 text-amber-950" : "bg-secondary text-muted-foreground")}>
            <Plane className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Fuera de oficina</p>
            <p className="text-xs text-muted-foreground">
              {fuera
                ? `Hasta el ${fechaCorta(fuera)} inclusive. Tus compañeros lo ven en Status, antes de pasarte una tarea.`
                : "Vacaciones, licencia, un viaje: tus compañeros lo ven en Status, al lado de tu nombre."}
            </p>
          </div>
          <Switch
            checked={fueraAbierto}
            disabled={disabled}
            aria-label="Fuera de oficina"
            onCheckedChange={(on) => {
              setFueraAbierto(on);
              if (on) abrirCalendario();
              else if (perfil.fuera_hasta) guardar({ fuera_hasta: null }, "Volviste a la oficina");
            }}
          />
        </div>
        {fueraAbierto && (
          <label className="mt-3 flex flex-wrap items-center gap-2 pl-12 text-[13px]">
            <span className="text-muted-foreground">Hasta el</span>
            <input
              ref={fecha}
              type="date"
              min={hoyISO()}
              value={fuera ?? ""}
              disabled={disabled}
              onChange={(e) => e.target.value && guardar({ fuera_hasta: e.target.value }, `Fuera de oficina hasta el ${fechaCorta(e.target.value)}`)}
              className="h-9 rounded-full border bg-card px-3 text-[13px] outline-none focus:border-foreground/40"
            />
            {!fuera && <span className="text-xs text-amber-800">Elegí el día para que se vea.</span>}
          </label>
        )}
      </div>
    </div>
  );
}

/* ───────────── Foto ───────────── */

const MAX_FOTO = 15 * 1024 * 1024;

/** La foto: la de Google, la de Basecamp o una subida (se recorta al centro, en cuadrado). */
export function FotoEditor({
  perfil,
  nombre,
  google,
  basecamp,
  guardar,
  disabled,
}: {
  perfil: Perfil;
  nombre: string;
  google: string | null;
  basecamp: string | null;
  guardar: Guardar;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const subida = perfil.foto_path ? urlFotoSubida(perfil.foto_path) : null;

  const subir = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast("Tiene que ser una imagen (JPG, PNG o WEBP)", "error");
    if (file.size > MAX_FOTO) return toast("La foto pesa más de 15 MB", "error");
    setSubiendo(true);
    try {
      const recorte = await recortarFoto(file);
      const { path, url } = await subirFoto(recorte);
      const anterior = perfil.foto_path;
      const ok = await guardar({ foto_origen: "subida", foto_url: url, foto_path: path }, "Foto nueva");
      borrarFoto(ok ? anterior : path);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo subir la foto", "error");
    } finally {
      setSubiendo(false);
    }
  };

  const elegir = (origen: FotoOrigen) => {
    if (origen === "google") guardar({ foto_origen: "google", foto_url: null }, "Foto: la de Google");
    if (origen === "basecamp" && basecamp) guardar({ foto_origen: "basecamp", foto_url: basecamp }, "Foto: la de Basecamp");
    if (origen === "subida" && subida) guardar({ foto_origen: "subida", foto_url: subida }, "Foto: la que subiste");
  };

  const quitarSubida = async () => {
    const path = perfil.foto_path;
    const ok = await guardar(
      perfil.foto_origen === "subida" ? { foto_path: null, foto_origen: null, foto_url: null } : { foto_path: null },
      "Foto subida borrada"
    );
    if (ok) borrarFoto(path);
  };

  const opciones: { origen: FotoOrigen; label: string; url: string | null; vacio: string }[] = [
    { origen: "google", label: "Google", url: google, vacio: "Sin foto en Google" },
    { origen: "basecamp", label: "Basecamp", url: basecamp, vacio: "Sin foto en Basecamp" },
    { origen: "subida", label: "Subida", url: subida, vacio: "Subí una" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {opciones.map((o) => {
          const activa = perfil.foto_origen === o.origen;
          const puede = Boolean(o.url) || o.origen === "subida";
          return (
            <div key={o.origen} className="relative">
              <button
                type="button"
                disabled={disabled || !puede || subiendo}
                onClick={() => (o.url ? elegir(o.origen) : input.current?.click())}
                aria-pressed={activa}
                className={cn(
                  "flex w-full flex-col items-center gap-2 rounded-2xl border bg-card px-2 py-3 transition-colors disabled:cursor-not-allowed",
                  activa ? "border-foreground ring-1 ring-foreground" : "hover:border-foreground/30",
                  !puede && "opacity-50"
                )}
              >
                {o.origen === "subida" && !o.url ? (
                  <span className="grid h-14 w-14 place-items-center rounded-full border border-dashed text-muted-foreground">
                    {subiendo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                  </span>
                ) : (
                  <FotoPerfil nombre={nombre} url={o.url} size={56} />
                )}
                <span className="flex items-center gap-1 text-[13px] font-medium">
                  {activa && <Check className="h-3.5 w-3.5" />}
                  {o.label}
                </span>
                {!o.url && <span className="-mt-1.5 text-center text-[11px] leading-tight text-muted-foreground">{o.vacio}</span>}
              </button>
              {o.origen === "subida" && o.url && (
                <div className="absolute right-1.5 top-1.5 flex gap-1">
                  <Hint label="Subir otra">
                    <button type="button" onClick={() => input.current?.click()} disabled={disabled || subiendo} aria-label="Subir otra foto" className="grid h-7 w-7 place-items-center rounded-full bg-card text-muted-foreground shadow ring-1 ring-black/10 hover:text-foreground">
                      {subiendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    </button>
                  </Hint>
                  <Hint label="Borrar la foto subida">
                    <button type="button" onClick={quitarSubida} disabled={disabled || subiendo} aria-label="Borrar la foto subida" className="grid h-7 w-7 place-items-center rounded-full bg-card text-muted-foreground shadow ring-1 ring-black/10 hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Hint>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <input
        ref={input}
        type="file"
        accept={FOTO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) subir(file);
        }}
      />
      <p className="text-xs text-muted-foreground">
        {perfil.foto_origen
          ? "Es la que se ve en toda la app: tu cuenta, tu perfil y Status."
          : "Todavía no elegiste: tu cuenta muestra la de Google y Status, la de Basecamp. Elegí una y se ve igual en todos lados."}
      </p>
    </div>
  );
}

/* ───────────── Nombre ───────────── */

export function NombreEditor({ perfil, guardar, disabled }: { perfil: Perfil; guardar: Guardar; disabled?: boolean }) {
  const [valor, setValor] = useState(perfil.nombre_visible ?? "");
  const demorado = useGuardadoDemorado((v) => {
    const limpio = v.trim().replace(/\s+/g, " ");
    if (limpio !== (perfil.nombre_visible ?? "")) guardar({ nombre_visible: limpio || null });
  });
  return (
    <div className="space-y-1.5">
      <input
        value={valor}
        disabled={disabled}
        maxLength={60}
        onChange={(e) => {
          setValor(e.target.value);
          demorado.cambiar(e.target.value);
        }}
        onBlur={demorado.flush}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder={perfil.full_name ?? "Cómo te dicen"}
        aria-label="Nombre para mostrar"
        className="h-11 w-full rounded-2xl border bg-card px-4 text-[15px] shadow-sm outline-none transition-colors focus:border-foreground/40 disabled:opacity-50"
      />
      <p className="text-xs text-muted-foreground">
        Cómo te dicen{perfil.full_name ? ` (en Google sos ${perfil.full_name})` : ""}. Se ve en tu cuenta y en tu perfil; en las filas de Status sigue tu nombre completo.
      </p>
    </div>
  );
}

/* ───────────── Acento ───────────── */

export function AcentoEditor({ perfil, guardar, disabled }: { perfil: Perfil; guardar: Guardar; disabled?: boolean }) {
  // Mientras se arrastra en el selector del sistema se ve al instante y se guarda al soltar (un pedido, no cien).
  const [previa, setPrevia] = useState<string | null>(null);
  const actual = previa ?? perfil.acento;
  const propio = actual && !ACENTOS.includes(actual);
  const poner = (hex: string | null) => {
    setPrevia(null);
    guardar({ acento: hex ? hex.toUpperCase() : null });
  };
  const demorado = useGuardadoDemorado((hex) => poner(hex));
  const muestra = "h-8 w-8 rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110 disabled:pointer-events-none";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ACENTOS.map((c) => (
        <Hint key={c} label={c}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => poner(c)}
            aria-label={`Acento ${c}`}
            aria-pressed={actual === c}
            className={cn(muestra, actual === c && "ring-2 ring-foreground")}
            style={{ background: c }}
          />
        </Hint>
      ))}
      <Hint label="Otro color">
        <label
          className={cn(muestra, "relative grid cursor-pointer place-items-center", propio && "ring-2 ring-foreground")}
          style={{ background: propio ? actual! : "conic-gradient(from 90deg, #f43f5e, #f59e0b, #84cc16, #06b6d4, #6366f1, #d946ef, #f43f5e)" }}
        >
          <Pipette className="h-3.5 w-3.5 text-white drop-shadow" />
          <input
            type="color"
            disabled={disabled}
            value={(actual ?? "#000000").toLowerCase()}
            onChange={(e) => {
              setPrevia(e.target.value.toUpperCase());
              demorado.cambiar(e.target.value);
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Otro color"
          />
        </label>
      </Hint>
      {actual && (
        <button type="button" disabled={disabled} onClick={() => poner(null)} className="ml-1 h-8 rounded-full px-2 text-[13px] font-medium text-muted-foreground hover:text-foreground">
          Sin color
        </button>
      )}
    </div>
  );
}

/* ───────────── Portada ───────────── */

/** La portada: la del estudio (por defecto) o un degradé con tu color. */
export function PortadaEditor({ perfil, guardar, disabled }: { perfil: Perfil; guardar: Guardar; disabled?: boolean }) {
  const actual = perfil.portada === "color" && perfil.acento ? "color" : "estudio";
  const opciones = [
    { value: "estudio", label: "La del estudio" },
    { value: "color", label: "Tu color" },
  ] as const;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Portada" className="flex rounded-full border bg-card p-0.5">
        {opciones.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={actual === o.value}
            disabled={disabled || (o.value === "color" && !perfil.acento)}
            onClick={() => guardar({ portada: o.value })}
            className={cn(
              "h-8 rounded-full px-3 text-[13px] font-medium transition-colors disabled:opacity-40",
              actual === o.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {!perfil.acento && <span className="text-xs text-muted-foreground">Elegí un color para usarlo de portada.</span>}
    </div>
  );
}

/* ───────────── Redes ───────────── */

/**
 * LinkedIn, Behance, Instagram y Facebook: el link o el usuario solo. Se guarda al salir del campo;
 * si no es de esa red, avisa y no se guarda.
 */
export function RedesEditor({ perfil, guardar, disabled }: { perfil: Perfil; guardar: Guardar; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      {REDES_PERFIL.map((r) => (
        <RedCampo key={r.id} red={r.id} nombre={r.nombre} ejemplo={r.ejemplo} perfil={perfil} guardar={guardar} disabled={disabled} />
      ))}
    </div>
  );
}

function RedCampo({
  red,
  nombre,
  ejemplo,
  perfil,
  guardar,
  disabled,
}: {
  red: RedPerfil;
  nombre: string;
  ejemplo: string;
  perfil: Perfil;
  guardar: Guardar;
  disabled?: boolean;
}) {
  const guardado = perfil.redes[red];
  const [valor, setValor] = useState(guardado ? textoDeRed(red, guardado) : "");
  const [error, setError] = useState(false);
  // Si cambió en la base (otro dispositivo, o se guardó acá normalizado), se muestra lo guardado.
  useEffect(() => {
    setValor(guardado ? textoDeRed(red, guardado) : "");
    setError(false);
  }, [guardado, red]);

  const confirmar = () => {
    const link = linkDeRed(red, valor);
    if (link === undefined) {
      setError(true);
      toast(`Eso no parece un link ni un usuario de ${nombre}`, "error");
      return;
    }
    setError(false);
    if ((link ?? undefined) === guardado) return;
    const redes = { ...perfil.redes };
    if (link) redes[red] = link;
    else delete redes[red];
    guardar({ redes }, link ? `${nombre} guardado` : `${nombre} quitado`);
  };

  return (
    <label className={cn("flex h-11 items-center gap-3 rounded-2xl border bg-card px-3.5 shadow-sm transition-colors focus-within:border-foreground/40", error && "border-destructive/60")}>
      <RedIcon red={red} className="text-muted-foreground" />
      <span className="sr-only">{nombre}</span>
      <input
        value={valor}
        disabled={disabled}
        maxLength={300}
        onChange={(e) => {
          setValor(e.target.value);
          setError(false);
        }}
        onBlur={confirmar}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder={ejemplo}
        aria-label={nombre}
        aria-invalid={error}
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
      />
      {guardado && (
        <a href={guardado} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground">
          Abrir
        </a>
      )}
    </label>
  );
}
