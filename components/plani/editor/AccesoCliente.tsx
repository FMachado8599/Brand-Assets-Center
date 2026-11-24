"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Mail, X } from "lucide-react";
import { useAccount } from "@/components/shell/AccountProvider";
import { toast } from "@/components/ui/toaster";
import { correosCliente, esDominio, type CorreoDeCliente } from "@/lib/correo/clientesCorreo";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Entrada = { id: number; email: string; creado: string; ultimo_uso: string };

const hace = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 2) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
};

/**
 * Quién puede entrar a la presentación compartida y cómo: con un mail del cliente (los de su ficha) y
 * un código que le llega desde la casilla de quien la compartió. Abajo, quién ya entró (y se le puede
 * cortar la entrada). `version` cambia al compartir o cambiar el link: se vuelve a leer todo.
 */
export function AccesoCliente({
  presentacionId,
  brandId,
  version,
  onUsarMiCasilla,
}: {
  presentacionId: string;
  brandId: string;
  version: string;
  onUsarMiCasilla: (yo: string) => Promise<boolean>;
}) {
  const yo = useAccount()?.user?.id ?? null;
  const [mails, setMails] = useState<CorreoDeCliente[] | null>(null);
  const [remitente, setRemitente] = useState<{ id: string | null; nombre: string | null } | null>(null);
  const [miCasilla, setMiCasilla] = useState<boolean | null>(null);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [cambiando, setCambiando] = useState(false);

  const cargar = useCallback(async () => {
    const [m, p, e] = await Promise.all([
      correosCliente.listar(brandId).catch(() => [] as CorreoDeCliente[]),
      supabase.from("presentaciones").select("compartida_por").eq("id", presentacionId).maybeSingle<{ compartida_por: string | null }>(),
      supabase
        .from("presentacion_accesos")
        .select("id, email, creado, ultimo_uso")
        .eq("presentacion_id", presentacionId)
        .gt("expira", new Date().toISOString())
        .order("ultimo_uso", { ascending: false })
        .limit(12),
    ]);
    setMails(m);
    setEntradas((e.data ?? []) as Entrada[]);
    const id = p.data?.compartida_por ?? null;
    let nombre: string | null = null;
    if (id && id !== yo) {
      const { data } = await supabase.from("profiles").select("nombre_visible, full_name, email").eq("id", id).maybeSingle<{ nombre_visible: string | null; full_name: string | null; email: string | null }>();
      nombre = data?.nombre_visible?.trim() || data?.full_name?.trim() || data?.email || null;
    }
    setRemitente({ id, nombre });
  }, [brandId, presentacionId, yo]);

  useEffect(() => {
    cargar();
  }, [cargar, version]);

  // Si el código sale de mi casilla, que esté conectada (si no, al cliente no le llega nada).
  const soyYo = Boolean(remitente?.id && remitente.id === yo);
  useEffect(() => {
    if (!soyYo) return;
    fetch("/api/correo/cuenta", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { conectada?: boolean } | null) => setMiCasilla(Boolean(j?.conectada)))
      .catch(() => setMiCasilla(null));
  }, [soyYo]);

  async function cortar(e: Entrada) {
    const { error } = await supabase.from("presentacion_accesos").delete().eq("id", e.id);
    if (error) return toast("No se pudo cortar la entrada", "error");
    setEntradas((x) => x.filter((y) => y.id !== e.id));
    toast(`${e.email} tiene que volver a poner su código`);
  }

  async function usarMia() {
    if (!yo) return;
    setCambiando(true);
    const ok = await onUsarMiCasilla(yo);
    setCambiando(false);
    if (ok) {
      toast("Listo: el código sale desde tu casilla");
      cargar();
    }
  }

  if (!mails || !remitente) return <div className="skeleton mt-2 h-16 rounded-lg" />;

  return (
    <div className="mt-2 grid gap-2 text-xs">
      <div>
        <p className="font-medium text-foreground">Pueden entrar</p>
        {mails.length === 0 ? (
          <Aviso>
            Todavía nadie: cargá los mails o el dominio del cliente en{" "}
            <Link href={`/clientes/${brandId}#correo`} className="font-semibold underline underline-offset-2">
              su ficha
            </Link>
            .
          </Aviso>
        ) : (
          <p className="mt-0.5 text-muted-foreground">
            {mails.map((m) => (esDominio(m.valor) ? `todos los de @${m.valor}` : m.valor)).join(", ")} ·{" "}
            <Link href={`/clientes/${brandId}#correo`} className="font-medium text-foreground underline underline-offset-2">
              editar
            </Link>
          </p>
        )}
      </div>

      <div>
        <p className="font-medium text-foreground">El código le llega desde</p>
        {!remitente.id ? (
          <Aviso>
            No se sabe de qué casilla.{" "}
            <BotonTexto onClick={usarMia} cargando={cambiando}>
              Que salga desde la mía
            </BotonTexto>
          </Aviso>
        ) : soyYo ? (
          miCasilla === false ? (
            <Aviso>
              Tu casilla, pero no está conectada: al cliente no le va a llegar el código.{" "}
              <Link href="/correo" className="font-semibold underline underline-offset-2">
                Conectala en Correo
              </Link>
              .
            </Aviso>
          ) : (
            <p className="mt-0.5 flex items-center gap-1 text-muted-foreground">
              <Mail className="h-3 w-3" /> Tu casilla
            </p>
          )
        ) : (
          <p className="mt-0.5 text-muted-foreground">
            La de {remitente.nombre ?? "quien la compartió"} ·{" "}
            <BotonTexto onClick={usarMia} cargando={cambiando}>
              que salga desde la mía
            </BotonTexto>
          </p>
        )}
      </div>

      {entradas.length > 0 && (
        <div>
          <p className="font-medium text-foreground">Entraron</p>
          <ul className="mt-0.5 grid gap-0.5">
            {entradas.map((e) => (
              <li key={e.id} className="group flex items-center gap-1.5 text-muted-foreground">
                <span className="min-w-0 flex-1 truncate" title={`Entró ${hace(e.creado)}`}>
                  {e.email}
                </span>
                <span className="shrink-0">{hace(e.ultimo_uso)}</span>
                <button
                  type="button"
                  aria-label={`Cortarle la entrada a ${e.email}`}
                  title="Cortar la entrada (tiene que volver a poner un código)"
                  onClick={() => cortar(e)}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full opacity-60 transition hover:bg-black/[0.06] hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-primary/25 px-2 py-1.5 text-foreground">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function BotonTexto({ onClick, cargando, children }: { onClick: () => void; cargando: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={cargando} className={cn("inline-flex items-center gap-1 font-semibold underline underline-offset-2", cargando && "opacity-60")}>
      {cargando && <Loader2 className="h-3 w-3 animate-spin" />}
      {children}
    </button>
  );
}
