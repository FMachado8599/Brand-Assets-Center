"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, KeyRound, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { boton, Campo, CampoContrasena, LARGO_MINIMO, pedirAuth } from "./piezas";

type Info = { valido: boolean; email?: string; nuevo?: boolean; tiene?: boolean; error?: string };

/**
 * /contrasena?token=…: con el link de un solo uso (una invitación o "me la olvidé") se crea o se cambia
 * la contraseña. Si la cuenta es nueva, también se pide el nombre. Al terminar, ya queda la sesión.
 */
export function CrearContrasena() {
  const token = useSearchParams().get("token") ?? "";
  const [info, setInfo] = useState<Info | null>(null);
  const [nombre, setNombre] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [repetir, setRepetir] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setInfo({ valido: false, error: "Falta el link. Abrí el que te mandaron o pedí uno nuevo." });
      return;
    }
    pedirAuth<Info>(`crear?token=${encodeURIComponent(token)}`).then((r) => setInfo(r.error && r.valido === undefined ? { valido: false, error: r.error } : r));
  }, [token]);

  const largo = [...contrasena.normalize("NFKC")].length;
  const coinciden = contrasena.length > 0 && contrasena === repetir;
  const listo = largo >= LARGO_MINIMO && coinciden && (!info?.nuevo || nombre.trim().length > 0);

  const guardar = async () => {
    setOcupado(true);
    setError(null);
    const r = await pedirAuth<{ ok?: boolean }>("crear", { token, contrasena, nombre: info?.nuevo ? nombre : undefined });
    if (r.ok) {
      window.location.href = "/perfil";
      return;
    }
    setError(r.error ?? "No se pudo guardar");
    setOcupado(false);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 pb-16 pt-24">
      <section className="rounded-[1.75rem] border border-black/[0.06] bg-card p-6 shadow-[0_1px_2px_hsl(40_30%_20%/0.04),0_18px_40px_-28px_hsl(40_45%_20%/0.3)] sm:p-8">
        <p className="eyebrow">
          Herramientas <span className="text-primary">\</span>
        </p>
        {!info ? (
          <div className="mt-4 space-y-3">
            <div className="skeleton h-9 w-2/3 rounded-full" />
            <div className="skeleton h-24 rounded-2xl" />
          </div>
        ) : !info.valido ? (
          <>
            <h1 className="mt-2 font-display text-4xl leading-none">Este link no sirve</h1>
            <p className="mt-2 text-sm text-muted-foreground">{info.error}</p>
            <Link href="/ingresar?modo=link" className={cn(boton, "mt-6 bg-foreground text-background hover:opacity-90")}>
              Pedir otro link
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-2 font-display text-4xl leading-none">{info.tiene ? "Cambiá tu contraseña" : "Creá tu contraseña"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Para <strong className="font-medium text-foreground">{info.email}</strong>. Con ella entrás desde cualquier computadora.
            </p>
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (listo && !ocupado) guardar();
              }}
            >
              {/* Para que el gestor de contraseñas la guarde con el mail correcto. */}
              <input type="email" autoComplete="username" value={info.email} readOnly hidden />
              {info.nuevo && (
                <Campo label="Tu nombre" autoComplete="name" required value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="Nombre y apellido" />
              )}
              <CampoContrasena
                label="Contraseña nueva"
                autoComplete="new-password"
                required
                value={contrasena}
                onChange={(e) => {
                  setContrasena(e.target.value);
                  setError(null);
                }}
                maxLength={128}
              />
              <CampoContrasena label="Repetila" autoComplete="new-password" required value={repetir} onChange={(e) => setRepetir(e.target.value)} maxLength={128} />
              <ul className="space-y-1 text-xs">
                <Regla ok={largo >= LARGO_MINIMO}>Al menos {LARGO_MINIMO} caracteres (una frase sirve: espacios y emojis valen)</Regla>
                <Regla ok={coinciden}>Las dos iguales</Regla>
                <li className="pl-5 text-muted-foreground">Se revisa que no esté en filtraciones de datos conocidas.</li>
              </ul>
              {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
              <button type="submit" disabled={!listo || ocupado} className={cn(boton, "bg-foreground text-background hover:opacity-90")}>
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Guardar y entrar
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

function Regla({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-start gap-1.5", ok ? "text-emerald-700" : "text-muted-foreground")}>
      <Check className={cn("mt-px h-3.5 w-3.5 shrink-0", !ok && "opacity-30")} /> {children}
    </li>
  );
}
