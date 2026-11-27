"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Lock } from "lucide-react";

export type Portada = { cliente: string; color: string; logo_url: string | null; logo_bg: "light" | "dark" | "brand" | null };

const MAIL_KEY = "plani:cliente:mail";

async function pedir(token: string, body: Record<string, string>) {
  const r = await fetch(`/api/p/${encodeURIComponent(token)}/entrar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!r) return { ok: false, mensaje: "No hay conexión. Revisá internet y probá de nuevo." };
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; mensaje?: string; error?: string };
  return { ok: r.ok && j.ok === true, mensaje: j.mensaje ?? j.error ?? (r.ok ? "" : "Algo falló. Probá de nuevo.") };
}

/**
 * La puerta de una presentación compartida: el link solo no alcanza. El cliente pone su mail (uno de
 * los cargados en su ficha), le llega un código y, con el código, entra. Ese navegador queda
 * habilitado 30 días.
 */
export function EntrarCliente({ token, portada, onAdentro }: { token: string; portada: Portada; onAdentro: () => void }) {
  const [paso, setPaso] = useState<"mail" | "codigo">("mail");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const codigoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setEmail(localStorage.getItem(MAIL_KEY) ?? "");
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  useEffect(() => {
    if (paso === "codigo") setTimeout(() => codigoRef.current?.focus(), 50);
  }, [paso]);

  async function mandar() {
    setCargando(true);
    setError(null);
    const r = await pedir(token, { accion: "pedir", email });
    setCargando(false);
    if (!r.ok) return setError(r.mensaje);
    try {
      localStorage.setItem(MAIL_KEY, email.trim());
    } catch {
      /* sin almacenamiento */
    }
    setAviso(r.mensaje);
    setCodigo("");
    setPaso("codigo");
  }

  async function canjear() {
    setCargando(true);
    setError(null);
    const r = await pedir(token, { accion: "canjear", email, codigo });
    setCargando(false);
    if (!r.ok) return setError(r.mensaje);
    onAdentro();
  }

  const fondo = portada.logo_bg === "dark" ? "#0b0b0e" : portada.logo_bg === "brand" ? portada.color : "#ffffff";
  const campo =
    "h-12 w-full rounded-2xl border border-cream/15 bg-cream/[0.06] px-4 text-[15px] text-cream outline-none placeholder:text-cream/35 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40";

  return (
    <main className="grain grid min-h-[100dvh] place-items-center bg-ink px-4 py-10 text-cream">
      <div className="w-full max-w-sm">
        <p className="site-label text-center text-cream/50">
          Cámara <span className="text-primary">\</span> TBWA
        </p>
        <div className="mt-8 flex flex-col items-center text-center">
          {portada.logo_url ? (
            <span className="grid h-20 w-20 place-items-center overflow-hidden rounded-3xl ring-1 ring-cream/10" style={{ background: fondo }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={portada.logo_url} alt="" className="h-full w-full object-contain p-[14%]" />
            </span>
          ) : (
            <span className="grid h-20 w-20 place-items-center rounded-3xl font-display text-3xl" style={{ background: portada.color }}>
              {portada.cliente.charAt(0)}
            </span>
          )}
          <h1 className="mt-5 font-display text-[2.6rem] leading-none [text-wrap:balance]">{portada.cliente}</h1>
          <p className="mt-3 flex items-center gap-1.5 text-sm text-cream/60">
            <Lock className="h-3.5 w-3.5" />
            {paso === "mail" ? "Para ver la presentación, entrá con tu mail." : `Te mandamos un código a ${email.trim()}.`}
          </p>
        </div>

        {paso === "mail" ? (
          <form
            className="mt-8 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!cargando) mandar();
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-cream/60">Tu mail</span>
              <input
                id="entrar-mail"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="nombre@empresa.com"
                className={campo}
              />
            </label>
            {error && <p className="text-sm text-[#ff8a80]">{error}</p>}
            <button
              type="submit"
              disabled={cargando || !email.trim()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground transition hover:brightness-95 disabled:opacity-50"
            >
              {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
              Mandarme un código
            </button>
            <p className="text-center text-xs leading-relaxed text-cream/45">
              Solo entran los mails que el estudio habilitó para tu empresa. Si el tuyo no está, pedíselo a tu contacto en Cámara TBWA.
            </p>
          </form>
        ) : (
          <form
            className="mt-8 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!cargando && codigo.length === 6) canjear();
            }}
          >
            {aviso && <p className="rounded-2xl bg-cream/[0.06] px-4 py-3 text-sm text-cream/75">{aviso}</p>}
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-cream/60">Código de 6 números</span>
              <input
                id="entrar-codigo"
                ref={codigoRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={codigo}
                onChange={(e) => {
                  setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                placeholder="••••••"
                className={`${campo} text-center font-mono text-2xl tracking-[0.5em]`}
              />
            </label>
            {error && <p className="text-sm text-[#ff8a80]">{error}</p>}
            <button
              type="submit"
              disabled={cargando || codigo.length !== 6}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground transition hover:brightness-95 disabled:opacity-50"
            >
              {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setPaso("mail");
                  setError(null);
                }}
                className="inline-flex items-center gap-1 text-cream/60 transition-colors hover:text-cream"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Otro mail
              </button>
              <button type="button" onClick={mandar} disabled={cargando} className="text-cream/60 underline underline-offset-2 transition-colors hover:text-cream">
                Mandarme otro
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
