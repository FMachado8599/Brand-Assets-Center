"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Search, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { api } from "@/lib/correo/cliente";
import { asignarFoto, LADO_AVATAR, quitarFoto, useContactos, type Contacto } from "@/lib/correo/contactos";
import { FOTO_ACCEPT } from "@/lib/perfil";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";

type Remitente = { email: string; nombre: string | null; mails: number; ultimo: string };

const ORIGEN: Record<NonNullable<Contacto["fotoOrigen"]>, string> = {
  perfil: "La eligió en su perfil",
  asignada: "Foto asignada",
  basecamp: "Foto de Basecamp",
};

const esMail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

/**
 * Las fotos de la gente que te escribe. La lista sale de tus últimos mails en Recibidos; también se
 * puede poner un mail a mano. La foto asignada la ve todo el estudio. Si la persona tiene cuenta en la
 * app, manda la de su perfil.
 */
export function FotosContactos({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const confirm = useConfirm();
  const [remitentes, setRemitentes] = useState<Remitente[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mirados, setMirados] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [soloSinFoto, setSoloSinFoto] = useState(true);
  const [extra, setExtra] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const para = useRef<string | null>(null);

  useEffect(() => {
    if (!open || remitentes) return;
    let vivo = true;
    api<{ remitentes: Remitente[]; mirados: number }>("/api/correo/remitentes")
      .then((r) => {
        if (!vivo) return;
        setRemitentes(r.remitentes);
        setMirados(r.mirados);
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [open, remitentes]);

  const todos = useMemo(() => {
    const lista = [...(remitentes ?? [])];
    for (const e of extra) if (!lista.some((r) => r.email === e)) lista.unshift({ email: e, nombre: null, mails: 0, ultimo: "" });
    return lista;
  }, [remitentes, extra]);

  const contactos = useContactos(todos.map((r) => r.email));
  const q = busqueda.trim().toLowerCase();
  const visibles = todos.filter((r) => {
    const c = contactos.get(r.email);
    if (soloSinFoto && c?.foto && !extra.includes(r.email)) return false;
    if (!q) return true;
    return r.email.includes(q) || (r.nombre ?? "").toLowerCase().includes(q) || (c?.nombre ?? "").toLowerCase().includes(q);
  });
  const nuevo = q && esMail(q) && !todos.some((r) => r.email === q) ? q : null;

  function elegir(email: string) {
    para.current = email;
    input.current?.click();
  }

  async function subir(file: File | undefined) {
    const email = para.current;
    para.current = null;
    if (!file || !email) return;
    setOcupado(email);
    try {
      await asignarFoto(email, file);
      setExtra((x) => (x.includes(email) ? x : [email, ...x]));
      toast("Foto guardada");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setOcupado(null);
    }
  }

  async function quitar(email: string) {
    const ok = await confirm({ title: "¿Quitarle la foto?", description: "Vuelve a la de Basecamp, si tiene, o a la inicial. Es para todo el estudio.", confirmLabel: "Quitar" });
    if (!ok) return;
    setOcupado(email);
    try {
      await quitarFoto(email);
      toast("Foto quitada");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(44rem,calc(100dvh-2rem))] w-[min(38rem,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0">
        <div className="border-b px-5 pb-4 pt-5">
          <DialogTitle className="text-xl">Fotos de la gente que te escribe</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            Una foto para cada mail, así lo reconocés al toque. La ve todo el estudio. Si la persona tiene cuenta en la app, se usa la de su perfil.
          </DialogDescription>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Buscar o poner un mail</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="fotos-buscar"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar, o escribir un mail que no esté"
                className="h-10 w-full rounded-full border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <div className="inline-flex rounded-full border bg-card p-0.5 text-[13px]" role="group" aria-label="Mostrar">
              {[
                [true, "Sin foto"],
                [false, "Todos"],
              ].map(([v, t]) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={soloSinFoto === v}
                  onClick={() => setSoloSinFoto(v as boolean)}
                  className={cn("h-8 rounded-full px-3 font-medium", soloSinFoto === v ? "bg-ink text-cream" : "text-muted-foreground hover:text-foreground")}
                >
                  {t as string}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {nuevo && (
            <Fila
              email={nuevo}
              nombre={null}
              detalle="Un mail que no está en la lista"
              contacto={contactos.get(nuevo)}
              ocupado={ocupado === nuevo}
              onSubir={() => elegir(nuevo)}
              onQuitar={() => quitar(nuevo)}
            />
          )}
          {error ? (
            <p className="p-6 text-center text-sm text-destructive">{error}</p>
          ) : !remitentes ? (
            <div className="space-y-px p-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : visibles.length === 0 && !nuevo ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {q ? "Nadie con eso. Si es un mail entero, escribilo completo para ponerle foto." : "Todos los que te escribieron ya tienen foto."}
            </p>
          ) : (
            <ul>
              {visibles.map((r) => (
                <li key={r.email}>
                  <Fila
                    email={r.email}
                    nombre={r.nombre}
                    detalle={r.mails ? `${r.mails} ${r.mails === 1 ? "mail" : "mails"}` : "Agregado recién"}
                    contacto={contactos.get(r.email)}
                    ocupado={ocupado === r.email}
                    onSubir={() => elegir(r.email)}
                    onQuitar={() => quitar(r.email)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          {remitentes ? `De tus últimos ${mirados} mails en Recibidos. ` : ""}La foto se recorta a un cuadrado de {LADO_AVATAR} px.
        </p>

        <input
          ref={input}
          type="file"
          accept={FOTO_ACCEPT}
          className="hidden"
          onChange={(e) => {
            subir(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function Fila({
  email,
  nombre,
  detalle,
  contacto,
  ocupado,
  onSubir,
  onQuitar,
}: {
  email: string;
  nombre: string | null;
  detalle: string;
  contacto?: Contacto;
  ocupado: boolean;
  onSubir: () => void;
  onQuitar: () => void;
}) {
  const origen = contacto?.fotoOrigen ?? null;
  const visible = nombre || contacto?.nombre;
  return (
    <div className="flex items-center gap-3 border-b border-black/[0.05] px-5 py-2.5">
      <Avatar d={{ nombre: visible ?? null, email }} contacto={contacto} className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{visible || email}</p>
        <p className="truncate text-xs text-muted-foreground">
          {visible ? `${email} · ` : ""}
          {origen ? ORIGEN[origen] : "Sin foto"} · {detalle}
        </p>
      </div>
      {ocupado ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
      ) : origen === "perfil" ? null : (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onSubir}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] font-medium transition-colors hover:border-foreground/30"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {origen ? "Cambiar" : "Poner foto"}
          </button>
          {origen === "asignada" && (
            <button
              type="button"
              aria-label="Quitar la foto"
              title="Quitar la foto"
              onClick={onQuitar}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
