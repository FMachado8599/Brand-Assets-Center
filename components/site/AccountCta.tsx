"use client";

import { useState } from "react";
import { ArrowDown, Check, Loader2, LogIn } from "lucide-react";
import { useAccount } from "@/components/shell/AccountProvider";
import { STUDIO_DOMAIN } from "@/lib/site";

/**
 * Entrar con Google, sobre fondo oscuro. Con sesión iniciada: en la portada,
 * un saludo que baja a las herramientas; más abajo, solo con qué cuenta entraste.
 */
export function AccountCta({ greet = false }: { greet?: boolean }) {
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  if (!account?.available) return null;

  if (!account.ready) return <span aria-hidden className="block h-12 w-52 animate-pulse rounded-full bg-cream/10" />;

  const { user } = account;
  if (user) {
    if (!greet) {
      return (
        <p className="flex items-center gap-2 text-sm text-cream/60">
          <Check className="h-4 w-4 text-primary" /> Entraste como {user.email}
        </p>
      );
    }
    const first = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").split(" ")[0];
    return (
      <a
        href="#herramientas"
        className="group inline-flex h-12 items-center gap-3 rounded-full border border-cream/25 px-6 text-sm font-medium transition-colors hover:border-cream hover:bg-cream hover:text-ink"
      >
        {first ? `Hola, ${first}` : "Hola"}
        <span className="text-cream/35 transition-colors group-hover:text-ink/35">—</span>
        elegí una herramienta
        <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
      </a>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await account.signIn();
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex h-12 items-center gap-2.5 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        Entrar con Google
      </button>
      <span className="site-label text-cream/45">Con tu cuenta @{STUDIO_DOMAIN}</span>
    </div>
  );
}
