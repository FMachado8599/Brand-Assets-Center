"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2, Mail, UserPlus } from "lucide-react";
import { GoogleMark } from "@/components/shell/AccountPill";
import { useAccount } from "@/components/shell/AccountProvider";
import { STUDIO } from "@/lib/site";
import { cn } from "@/lib/utils";
import { boton, Campo, CampoContrasena, LARGO_MINIMO, pedirAuth } from "./piezas";

type Modo = "entrar" | "crear" | "link";

/**
 * /ingresar: entrar con mail y contraseña (o con Google), o pedir el link para crear la contraseña la
 * primera vez o si te la olvidaste. Los mensajes no dicen si un mail tiene cuenta.
 */
export function Ingresar() {
  const account = useAccount();
  const params = useSearchParams();
  const destino = params.get("next") ?? "/";
  const pedido = params.get("modo");
  const [modo, setModo] = useState<Modo>(pedido === "link" ? "link" : pedido === "crear" ? "crear" : "entrar");
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [repetir, setRepetir] = useState("");
  /** Este entorno manda mails (Resend): sin eso, "me la olvidé" lo resuelve un admin. */
  const [hayMail, setHayMail] = useState(false);
  const [pedidoListo, setPedidoListo] = useState(false);

  useEffect(() => {
    pedirAuth<{ mail?: boolean }>("estado").then((r) => setHayMail(Boolean(r.mail)));
  }, []);
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

  const crearCuenta = async () => {
    if (contrasena !== repetir) return setError("Las dos contraseñas no son iguales");
    setOcupado(true);
    setError(null);
    const r = await pedirAuth<{ ok?: boolean }>("registrarse", { nombre, email, contrasena });
    setOcupado(false);
    if (!r.ok) return setError(r.error ?? "No se pudo mandar el pedido");
    setContrasena("");
    setRepetir("");
    setPedidoListo(true);
  };

  const cambiar = (m: Modo) => {
    setModo(m);
    setError(null);
    setAviso(null);
    setPedidoListo(false);
  };

  const pedirLink = async () => {
    setOcupado(true);
    setError(null);
    const r = await pedirAuth<{ ok?: boolean; sinMail?: boolean }>("pedir", { email });
    setOcupado(false);
    if (r.error) return setError(r.error);
    setAviso(
      r.sinMail
        ? "Por ahora los links los da un admin: pedile que te genere uno desde Ajustes → Accesos."
        : `Si ${email} tiene acceso, te llegó un mail con el link (vale 1 hora). Revisá también el spam.`
    );
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 pb-16 pt-24">
      <section className="rounded-[1.75rem] border border-foreground/[0.06] bg-card p-6 shadow-[0_1px_2px_hsl(40_30%_20%/0.04),0_18px_40px_-28px_hsl(40_45%_20%/0.3)] sm:p-8">
        <p className="eyebrow">
          Herramientas <span className="text-primary">\</span>
        </p>
        <h1 className="mt-2 font-display text-4xl leading-none">
          {modo === "entrar" ? "Entrar" : modo === "crear" ? "Crear cuenta" : "Tu contraseña"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {modo === "entrar"
            ? `Solo para el equipo de ${STUDIO} y la gente que habilita un admin.`
            : modo === "crear"
              ? "Pedís tu cuenta y un admin la aprueba. Hasta entonces no podés entrar."
              : "¿Te la olvidaste? Te mandamos un link para crear una nueva."}
        </p>

        {pedidoListo ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-200">
              <strong className="font-semibold">Listo, {nombre.split(" ")[0]}.</strong> Tu pedido le llegó a los admins de Herramientas.
              Avisale a alguno (por WhatsApp o Slack) para que te apruebe: después entrás con <strong className="font-semibold">{email}</strong> y la
              contraseña que elegiste.
            </p>
            <button type="button" onClick={() => cambiar("entrar")} className={cn(boton, "border bg-card font-medium hover:bg-secondary")}>
              Volver a Entrar
            </button>
          </div>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ocupado) (modo === "entrar" ? entrar : modo === "crear" ? crearCuenta : pedirLink)();
            }}
          >
            {modo === "crear" && (
              <Campo label="Tu nombre" autoComplete="name" required maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" />
            )}
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
            {modo !== "link" && (
              <CampoContrasena
                label="Contraseña"
                autoComplete={modo === "crear" ? "new-password" : "current-password"}
                required
                maxLength={modo === "crear" ? 128 : undefined}
                value={contrasena}
                onChange={(e) => {
                  setContrasena(e.target.value);
                  setError(null);
                }}
                hint={modo === "crear" ? `Al menos ${LARGO_MINIMO} caracteres. Una frase sirve; se revisa que no esté en filtraciones conocidas.` : undefined}
              />
            )}
            {modo === "crear" && (
              <CampoContrasena label="Repetila" autoComplete="new-password" required maxLength={128} value={repetir} onChange={(e) => setRepetir(e.target.value)} />
            )}
            {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
            {aviso && <p className="rounded-xl bg-secondary px-3 py-2 text-[13px]">{aviso}</p>}
            <button
              type="submit"
              disabled={ocupado || !email || (modo !== "link" && !contrasena) || (modo === "crear" && (!nombre.trim() || !repetir))}
              className={cn(boton, "bg-foreground text-background hover:opacity-90")}
            >
              {ocupado ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : modo === "entrar" ? (
                <KeyRound className="h-4 w-4" />
              ) : modo === "crear" ? (
                <UserPlus className="h-4 w-4" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {modo === "entrar" ? "Entrar" : modo === "crear" ? "Pedir mi cuenta" : "Mandarme el link"}
            </button>
          </form>
        )}

        <div className={cn("mt-3 flex flex-col items-center gap-1.5 text-[13px] font-medium text-muted-foreground", pedidoListo && "hidden")}>
          {modo === "entrar" ? (
            <>
              <button type="button" onClick={() => cambiar("crear")} className="transition-colors hover:text-foreground">
                ¿No tenés cuenta? <span className="text-foreground underline-offset-2 hover:underline">Creala</span>
              </button>
              {hayMail ? (
                <button type="button" onClick={() => cambiar("link")} className="transition-colors hover:text-foreground">
                  Me olvidé la contraseña
                </button>
              ) : (
                <span className="text-center text-xs font-normal">¿Te la olvidaste? Pedile a un admin un link para cambiarla.</span>
              )}
            </>
          ) : (
            <button type="button" onClick={() => cambiar("entrar")} className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Ya tengo cuenta
            </button>
          )}
        </div>

        {account?.available && (
          <>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> o <span className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              onClick={() => account.signIn()}
              className={cn(boton, "border bg-white font-medium shadow-sm hover:bg-secondary dark:bg-card dark:hover:bg-secondary")}
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
