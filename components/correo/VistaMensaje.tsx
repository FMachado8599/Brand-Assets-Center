"use client";

import { Archive, ArrowLeft, Download, Forward, Inbox, Loader2, Mail, Reply, ReplyAll, Star, Trash2, type LucideIcon } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { fechaLarga } from "@/lib/correo/cliente";
import { formatoTamano, nombreDireccion, type AccionMensaje, type Direccion, type Mensaje, type ModoEnvio } from "@/lib/correo/types";
import { cn } from "@/lib/utils";
import { CuerpoMail } from "./CuerpoMail";

type Props = {
  carpeta: string;
  mensaje: Mensaje | null;
  cargando: boolean;
  error: string | null;
  enPapelera: boolean;
  onVolver: () => void;
  onResponder: (modo: Exclude<ModoEnvio, "nuevo">) => void;
  onAccion: (accion: AccionMensaje) => void;
};

/** El mail abierto: quién lo manda, a quién, los adjuntos y el texto. Arriba, responder y lo demás. */
export function VistaMensaje({ carpeta, mensaje, cargando, error, enPapelera, onVolver, onResponder, onAccion }: Props) {
  if (!mensaje) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center border-b px-2 py-1.5 md:hidden">
          <Accion label="Volver a la lista" icon={ArrowLeft} onClick={onVolver} />
        </div>
        <div className="grid flex-1 place-items-center p-8 text-center text-muted-foreground">
          {cargando ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <div>
              <Inbox className="mx-auto h-8 w-8 opacity-50" />
              <p className="mt-3 text-sm">{error ?? "Elegí un mail para leerlo"}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const adjuntos = mensaje.listaAdjuntos.filter((a) => !a.inline);
  const varios = mensaje.para.length + mensaje.cc.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b px-2 py-1.5">
        <Accion label="Volver a la lista" icon={ArrowLeft} onClick={onVolver} className="md:hidden" />
        <Accion label="Responder" icon={Reply} onClick={() => onResponder("responder")} texto="Responder" />
        {varios && <Accion label="Responder a todos" icon={ReplyAll} onClick={() => onResponder("responder_todos")} />}
        <Accion label="Reenviar" icon={Forward} onClick={() => onResponder("reenviar")} />
        <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        <Accion label="Archivar" icon={Archive} onClick={() => onAccion("archivar")} />
        <Accion label={enPapelera ? "Borrar para siempre" : "Mandar a la Papelera"} icon={Trash2} onClick={() => onAccion("papelera")} />
        <Accion label="Marcar como no leído" icon={Mail} onClick={() => onAccion("no_leido")} />
        <Accion
          label={mensaje.destacado ? "Quitar destacado" : "Destacar"}
          icon={Star}
          activo={mensaje.destacado}
          onClick={() => onAccion(mensaje.destacado ? "quitar_destacado" : "destacar")}
        />
        {cargando && <Loader2 className="ml-auto mr-2 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <header className="px-5 pb-4 pt-5 sm:px-6">
          <h2 className="font-display text-[1.7rem] leading-tight [overflow-wrap:anywhere]">{mensaje.asunto || "(Sin asunto)"}</h2>
          <div className="mt-4 flex items-start gap-3">
            <Inicial d={mensaje.de[0]} />
            <div className="min-w-0 flex-1 text-[13px]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="min-w-0 truncate">
                  <span className="text-[15px] font-semibold">{mensaje.de[0] ? nombreDireccion(mensaje.de[0]) : "—"}</span>
                  {mensaje.de[0]?.nombre && <span className="ml-1.5 text-muted-foreground">{mensaje.de[0].email}</span>}
                </p>
                <span className="shrink-0 text-muted-foreground">{fechaLarga(mensaje.fecha)}</span>
              </div>
              <Lista label="Para" lista={mensaje.para} />
              <Lista label="CC" lista={mensaje.cc} />
            </div>
          </div>

          {adjuntos.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {adjuntos.map((a) => (
                <a
                  key={a.indice}
                  href={`/api/correo/adjunto?carpeta=${encodeURIComponent(carpeta)}&uid=${mensaje.uid}&i=${a.indice}&descargar=1`}
                  download={a.nombre}
                  className="group inline-flex max-w-full items-center gap-2 rounded-xl border bg-card px-3 py-2 text-[13px] transition-colors hover:border-foreground/30"
                >
                  <Download className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                  <span className="truncate font-medium">{a.nombre}</span>
                  <span className="shrink-0 text-muted-foreground">{formatoTamano(a.tamano)}</span>
                </a>
              ))}
            </div>
          )}
        </header>
        <div className="border-t">
          <CuerpoMail html={mensaje.html} texto={mensaje.texto} />
        </div>
      </div>
    </div>
  );
}

function Lista({ label, lista }: { label: string; lista: Direccion[] }) {
  if (!lista.length) return null;
  return (
    <p className="mt-0.5 text-muted-foreground [overflow-wrap:anywhere]">
      {label}: {lista.map((d) => (d.nombre ? `${d.nombre} <${d.email}>` : d.email)).join(", ")}
    </p>
  );
}

/** El círculo con la inicial de quien lo manda (los mails no traen foto). */
export function Inicial({ d, className }: { d?: Direccion; className?: string }) {
  const texto = d ? nombreDireccion(d) : "?";
  let h = 0;
  for (const c of d?.email ?? "") h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-ink", className)}
      style={{ background: `hsl(${h} 55% 82%)` }}
    >
      {texto.replace(/^["'\s]+/, "").charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function Accion({ label, icon: Icon, onClick, texto, activo, className }: { label: string; icon: LucideIcon; onClick: () => void; texto?: string; activo?: boolean; className?: string }) {
  return (
    <Hint label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          activo && "text-foreground",
          className
        )}
      >
        <Icon className={cn("h-[18px] w-[18px]", activo && "fill-primary text-ink")} />
        {texto && <span className="hidden sm:inline">{texto}</span>}
      </button>
    </Hint>
  );
}
