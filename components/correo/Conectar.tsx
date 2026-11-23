"use client";

import { useState } from "react";
import { DatabaseZap, Loader2, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, jsonInit } from "@/lib/correo/cliente";
import type { EstadoCuenta } from "@/lib/correo/types";

/**
 * Conectar la casilla: el mail es el de tu cuenta (no se elige) y la contraseña, la del correo, la misma
 * de Outlook. El servidor la prueba contra mail.camaratbwa.com antes de guardarla.
 */
export function Conectar({ estado, aviso, onConectada }: { estado: EstadoCuenta; aviso: string | null; onConectada: () => void }) {
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!estado.puede) {
    return (
      <Marco>
        <h1 className="mt-3 font-display text-4xl">Tu cuenta no tiene casilla</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El correo es para las cuentas @{estado.dominio}. Entraste con {estado.email ?? "otra cuenta"}.
        </p>
      </Marco>
    );
  }

  async function conectar(e: React.FormEvent) {
    e.preventDefault();
    if (!password || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await api("/api/correo/cuenta", jsonInit("POST", { password }));
      setPassword("");
      onConectada();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Marco>
      <h1 className="mt-3 font-display text-4xl">Conectá tu casilla</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tu correo de siempre, el de Outlook: lo que leas, mandes o borres acá también se ve allá. Poné la contraseña de tu correo y listo.
      </p>

      {aviso && <p className="mt-4 rounded-xl bg-primary/25 px-4 py-2.5 text-left text-sm">{aviso}</p>}
      {estado.sinSecreto && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-primary/25 px-4 py-2.5 text-left text-sm">
          <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" />
          Falta INTEGRACIONES_SECRET en las variables del servidor: sin eso no se puede guardar la contraseña.
        </p>
      )}

      <form onSubmit={conectar} className="mt-6 space-y-3 text-left">
        <label className="block">
          <span className="text-[13px] font-medium text-muted-foreground">Tu mail</span>
          <div className="mt-1 flex h-10 items-center gap-2 rounded-md border bg-secondary/50 px-3 text-sm">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{estado.email}</span>
          </div>
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-muted-foreground">Contraseña del correo</span>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="La misma que usás en Outlook"
            className="mt-1"
            autoFocus
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={!password || enviando || estado.sinSecreto}>
          {enviando && <Loader2 className="animate-spin" />}
          {enviando ? "Probando la contraseña…" : "Conectar"}
        </Button>
      </form>

      <p className="mt-5 flex items-start gap-2 text-left text-xs text-muted-foreground">
        <LockKeyhole className="mt-px h-3.5 w-3.5 shrink-0" />
        La contraseña queda guardada cifrada y solo la usa el servidor para entrar a tu casilla ({estado.servidor}). Nadie del estudio la puede ver, ni los admins.
      </p>
    </Marco>
  );
}

export function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 pb-16 pt-32 text-center sm:pt-40">
      <p className="eyebrow">
        Correo <span className="text-primary">\</span>
      </p>
      {children}
    </main>
  );
}
