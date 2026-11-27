"use client";

import { useRef, useState } from "react";
import { Archive, ArrowLeft, Briefcase, Download, Forward, ImagePlus, Inbox, Loader2, Mail, Reply, ReplyAll, Star, Trash2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ClientMark } from "@/components/clients/ClientMark";
import { Hint } from "@/components/ui/tooltip";
import { fechaLarga } from "@/lib/correo/cliente";
import { asignarFoto, useContacto, useContactos } from "@/lib/correo/contactos";
import { useStoredState } from "@/hooks/useStoredState";
import { FOTO_ACCEPT } from "@/lib/perfil";
import { toast } from "@/components/ui/toaster";
import { formatoTamano, nombreDireccion, type AccionMensaje, type Direccion, type Mensaje, type ModoEnvio } from "@/lib/correo/types";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { ContextoCliente } from "./ContextoCliente";
import { CuerpoMail } from "./CuerpoMail";

type Props = {
  carpeta: string;
  /** Tu casilla: en una lista larga de destinatarios, si estás vos va primero. */
  yo: string;
  mensaje: Mensaje | null;
  cargando: boolean;
  error: string | null;
  enPapelera: boolean;
  onVolver: () => void;
  onResponder: (modo: Exclude<ModoEnvio, "nuevo">) => void;
  onAccion: (accion: AccionMensaje) => void;
};

/** El mail abierto: quién lo manda, a quién, los adjuntos y el texto. Arriba, responder y lo demás. */
export function VistaMensaje({ carpeta, yo, mensaje, cargando, error, enPapelera, onVolver, onResponder, onAccion }: Props) {
  const de = mensaje?.de[0];
  const contacto = useContacto(de?.email);
  // El cliente del mail: el de quien lo manda o, si lo mandaste vos (o es de alguien del estudio), el
  // primero de los destinatarios que sea de un cliente.
  const gente = mensaje ? [...mensaje.de, ...mensaje.para, ...mensaje.cc].map((d) => d.email).filter((e) => e !== yo.toLowerCase()) : [];
  const contactos = useContactos(gente);
  const cliente = gente.map((e) => contactos.get(e)?.clientes[0]).find(Boolean) ?? null;
  const [conContexto, setConContexto] = useStoredState("correo:contexto", true);

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
        {cliente && (
          <>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            <Accion
              label={conContexto ? `Ocultar lo de ${cliente.name}` : `Ver lo de ${cliente.name}: tareas, presentaciones y equipo`}
              icon={Briefcase}
              prendido={conContexto}
              onClick={() => setConContexto(!conContexto)}
              texto="Contexto"
            />
          </>
        )}
        {cargando && <Loader2 className="ml-auto mr-2 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <header className="px-5 pb-4 pt-5 sm:px-6">
          <h2 className="font-display text-[1.7rem] leading-tight [overflow-wrap:anywhere]">{mensaje.asunto || "(Sin asunto)"}</h2>
          <div className="mt-4 flex items-start gap-3">
            <FotoDe d={de} contacto={contacto} />
            <div className="min-w-0 flex-1 text-[13px]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="min-w-0 truncate">
                  {/* El nombre del mail o, si viene solo la dirección, el que conoce la app (su perfil o Basecamp). */}
                  <span className="text-[15px] font-semibold">{de ? de.nombre || contacto?.nombre || de.email : "—"}</span>
                  {de && (de.nombre || contacto?.nombre) && <span className="ml-1.5 text-muted-foreground">{de.email}</span>}
                </p>
                <span className="shrink-0 text-muted-foreground">{fechaLarga(mensaje.fecha)}</span>
              </div>
              {contacto && (contacto.cargo || contacto.clientes.length > 0) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {contacto.cargo && <span className="text-foreground/80">{contacto.cargo}</span>}
                  {contacto.clientes.map((c) => (
                    <Link
                      key={c.id}
                      href={`/clientes/${c.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-card py-0.5 pl-0.5 pr-2 text-[12px] font-medium text-foreground transition-colors hover:border-foreground/30"
                    >
                      <ClientMark brand={c} className="h-5 w-5 rounded-full" pad="p-[12%]" />
                      {c.name}
                    </Link>
                  ))}
                </p>
              )}
              {/* key: al abrir otro mail, las listas vuelven a arrancar cerradas. */}
              <Lista key={`para-${mensaje.uid}`} label="Para" lista={mensaje.para} yo={yo} />
              <Lista key={`cc-${mensaje.uid}`} label="CC" lista={mensaje.cc} yo={yo} />
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
        {cliente && conContexto && <ContextoCliente cliente={cliente} asunto={mensaje.asunto} onCerrar={() => setConContexto(false)} />}
        <div className="border-t">
          <CuerpoMail html={mensaje.html} texto={mensaje.texto} />
        </div>
      </div>
    </div>
  );
}

/**
 * La foto de quien manda el mail. Si no la eligió en su perfil, tocándola se le pone una (la ve todo el
 * estudio): es lo más rápido para el que te escribe seguido y no tiene foto.
 */
function FotoDe({ d, contacto }: { d?: Direccion; contacto: ReturnType<typeof useContacto> }) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const avatar = <Avatar d={d} contacto={contacto} className="h-11 w-11" />;
  if (!d || contacto?.fotoOrigen === "perfil") return avatar;
  const quien = d.nombre || contacto?.nombre || d.email;
  const label = contacto?.foto ? `Cambiarle la foto a ${quien}` : `Ponerle foto a ${quien}`;
  return (
    <>
      <Hint label={label}>
        <button type="button" aria-label={label} onClick={() => input.current?.click()} className="group relative shrink-0 rounded-full">
          {avatar}
          <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/45 text-cream opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </span>
        </button>
      </Hint>
      <input
        ref={input}
        type="file"
        accept={FOTO_ACCEPT}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setSubiendo(true);
          try {
            await asignarFoto(d.email, file);
            toast("Foto guardada");
          } catch (err) {
            toast((err as Error).message, "error");
          } finally {
            setSubiendo(false);
          }
        }}
      />
    </>
  );
}

/** Hasta cuántos destinatarios se muestran enteros; con más, se ven los primeros y "y N más". */
const VISIBLES = 3;

const completa = (d: Direccion) => (d.nombre ? `${d.nombre} <${d.email}>` : d.email);

/**
 * Para y CC. Con pocos, cada uno con su mail. Con muchos (un mail a todo el estudio), solo los nombres de
 * los primeros (vos primero, si estás) y un botón para ver la lista entera.
 */
function Lista({ label, lista, yo }: { label: string; lista: Direccion[]; yo: string }) {
  const [abierta, setAbierta] = useState(false);
  if (!lista.length) return null;
  const larga = lista.length > VISIBLES + 1;

  if (!larga) {
    return (
      <p className="mt-0.5 text-muted-foreground [overflow-wrap:anywhere]">
        {label}: {lista.map(completa).join(", ")}
      </p>
    );
  }

  // Abierta: la lista entera en una caja con scroll, así el mail no queda allá abajo.
  if (abierta) {
    return (
      <div className="mt-0.5 text-muted-foreground">
        <p>
          {label} ({lista.length}): <BotonLista onClick={() => setAbierta(false)}>Mostrar menos</BotonLista>
        </p>
        <p className="mt-1 max-h-36 overflow-y-auto rounded-xl border bg-background/60 px-3 py-2 [overflow-wrap:anywhere]">
          {lista.map(completa).join(", ")}
        </p>
      </div>
    );
  }

  const mia = lista.findIndex((d) => d.email === yo.toLowerCase());
  const orden = mia > 0 ? [lista[mia], ...lista.filter((_, i) => i !== mia)] : lista;
  const primeros = orden.slice(0, VISIBLES);
  return (
    <p className="mt-0.5 text-muted-foreground [overflow-wrap:anywhere]">
      {label}:{" "}
      {primeros.map((d, i) => (
        <span key={d.email} title={d.email}>
          {i > 0 && ", "}
          {d.email === yo.toLowerCase() ? "vos" : nombreDireccion(d)}
        </span>
      ))}{" "}
      <BotonLista onClick={() => setAbierta(true)} title={`Ver los ${lista.length}`}>
        y {lista.length - VISIBLES} más
      </BotonLista>
    </p>
  );
}

function BotonLista({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-full font-medium text-foreground underline decoration-foreground/30 underline-offset-2 transition-colors hover:decoration-foreground"
    >
      {children}
    </button>
  );
}

function Accion({
  label,
  icon: Icon,
  onClick,
  texto,
  activo,
  prendido,
  className,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  texto?: string;
  /** Destacado: el ícono se rellena de amarillo. */
  activo?: boolean;
  /** Un interruptor (ej: el contexto): prendido, el botón queda marcado. */
  prendido?: boolean;
  className?: string;
}) {
  return (
    <Hint label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={prendido}
        onClick={onClick}
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          activo && "text-foreground",
          prendido && "bg-primary/30 text-foreground hover:bg-primary/40",
          className
        )}
      >
        <Icon className={cn("h-[18px] w-[18px]", activo && "fill-primary text-ink")} />
        {texto && <span className="hidden sm:inline">{texto}</span>}
      </button>
    </Hint>
  );
}
