"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2, Mail } from "lucide-react";
import { GoogleMark } from "@/components/shell/AccountPill";
import { useAccount } from "@/components/shell/AccountProvider";
import { STUDIO } from "@/lib/site";
import { cn } from "@/lib/utils";
import { boton, Campo, CampoContrasena, pedirAuth } from "./piezas";

type Modo = "entrar" | "link";

/**
 * /ingresar: entrar con mail y contraseña (o con Google), o pedir el link para crear la contraseña la
 * primera vez o si te la olvidaste. Los mensajes no dicen si un mail tiene cuenta.
 */
export function Ingresar() {
  const account = useAccount();
  const params = useSearchParams();
  const destino = params.get("next") ?? "/";
  const [modo, setModo] = useState<Modo>(params.get("modo") === "link" ? "link" : "entrar");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Ya entraste: a donde ibas.
  useEffect(() => {
    if (account?.ready && account.user) window.location.replace(destino.startsWith("/") && !destino.startsWith("//") ? destino : "/");
  }, [account?.ready, account?.user, destino]);

  const entrar = async () => {
    setOcupado(true);
    setError(null);
    const r = await pedirAuth<{ ok?: boolean; destino?: string }>("ingresar", { email, contrasena, destino });
    if (r.ok) {
      // Recarga completa: así toda la app arranca con la sesión nueva.
      window.location.href = r.destino ?? "/";
      return;
    }
    setContrasena("");
    setError(r.error ?? "No se pudo entrar");
    setOcupado(false);
  };

  const pedirLink = async () => {
    setOcupado(true);
    setError(null);
    const r = await pedirAuth<{ ok?: boolean; sinMail?: boolean }>("pedir", { email });
    setOcupado(false);
    if (r.error) return setError(r.error);
    setAviso(
      r.sinMail
        ? "Por ahora los links los da un admin: pedile que te genere uno desde Board → Accesos."
        : `Si ${email} tiene acceso, te llegó un mail con el link (vale 1 hora). Revisá también el spam.`
    );
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 pb-16 pt-24">
      <section className="rounded-[1.75rem] border border-black/[0.06] bg-card p-6 shadow-[0_1px_2px_hsl(40_30%_20%/0.04),0_18px_40px_-28px_hsl(40_45%_20%/0.3)] sm:p-8">
        <p className="eyebrow">
          Herramientas <span className="text-primary">\</span>
        </p>
        <h1 className="mt-2 font-display text-4xl leading-none">{modo === "entrar" ? "Entrar" : "Tu contraseña"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {modo === "entrar"
            ? `Solo para el equipo de ${STUDIO} y la gente que habilita un admin.`
            : "¿Primera vez o te la olvidaste? Te mandamos un link para crearla."}
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ocupado) (modo === "entrar" ? entrar : pedirLink)();
          }}
        >
          <Campo
            label="Mail"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
              setAviso(null);
            }}
            placeholder="vos@agencia.com"
          />
          {modo === "entrar" && (
            <CampoContrasena
              label="Contraseña"
              autoComplete="current-password"
              required
              value={contrasena}
              onChange={(e) => {
                setContrasena(e.target.value);
                setError(null);
              }}
            />
          )}
          {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
          {aviso && <p className="rounded-xl bg-secondary px-3 py-2 text-[13px]">{aviso}</p>}
          <button type="submit" disabled={ocupado || !email || (modo === "entrar" && !contrasena)} className={cn(boton, "bg-foreground text-background hover:opacity-90")}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : modo === "entrar" ? <KeyRound className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            {modo === "entrar" ? "Entrar" : "Mandarme el link"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setModo(modo === "entrar" ? "link" : "entrar");
            setError(null);
            setAviso(null);
          }}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {modo === "entrar" ? (
            "¿Primera vez o te olvidaste la contraseña?"
          ) : (
            <>
              <ArrowLeft className="h-3.5 w-3.5" /> Ya tengo contraseña
            </>
          )}
        </button>

        {account?.available && (
          <>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> o <span className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              onClick={() => account.signIn()}
              className={cn(boton, "border bg-white font-medium shadow-sm hover:bg-secondary")}
            >
              <GoogleMark /> Continuar con Google
            </button>
          </>
        )}
      </section>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        <Link href="/privacidad" className="underline-offset-2 hover:underline">
          Qué datos guardamos
        </Link>
      </p>
    </main>
  );
}
