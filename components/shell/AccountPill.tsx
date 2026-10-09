"use client";

import { forwardRef, useState, type ButtonHTMLAttributes } from "react";
import type { User } from "@supabase/supabase-js";
import { Check, Loader2, LogIn, LogOut } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/tooltip";
import { STUDIO_DOMAIN } from "@/lib/site";
import { cn } from "@/lib/utils";
import { useAccount } from "./AccountProvider";

const SYNCED = [
  "Favoritos y recientes de emojis",
  "Ajustes de emojis, GIF y conversor",
  "Tus redacciones y los emojis y hashtags de cada cliente",
  "Tus tarjetas quedan a tu nombre",
];

function displayName(user: User) {
  const meta = user.user_metadata ?? {};
  return (meta.full_name as string) || (meta.name as string) || user.email || "Tu cuenta";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

/** Foto de Google; si no hay (o no carga), las iniciales. Sin sesión, un avatar genérico. */
export function UserAvatar({ user, size }: { user: User | null; size: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };

  if (!user) {
    return (
      <span className="relative block shrink-0" style={style}>
        <svg viewBox="0 0 36 36" className="h-full w-full rounded-full text-foreground/45" aria-hidden>
          <circle cx="18" cy="18" r="18" fill="hsl(var(--secondary))" />
          <circle cx="18" cy="14" r="6" fill="currentColor" />
          <path d="M6.5 31.5c1.9-5.8 6.4-8.9 11.5-8.9s9.6 3.1 11.5 8.9a17.9 17.9 0 0 1-23 0z" fill="currentColor" />
        </svg>
        {/* Marca de "entrá acá" */}
        <span className="absolute -bottom-0.5 -right-0.5 grid h-[42%] w-[42%] place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-white">
          <LogIn className="h-[60%] w-[60%]" strokeWidth={2.5} />
        </span>
      </span>
    );
  }

  const meta = user.user_metadata ?? {};
  const url = (meta.avatar_url as string) || (meta.picture as string) || "";
  if (url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover ring-2 ring-white"
        style={style}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground ring-2 ring-white"
      style={{ ...style, fontSize: size * 0.38 }}
    >
      {initials(displayName(user))}
    </span>
  );
}

type TriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & { user: User | null; ready: boolean };

/** Botón flotante de arriba a la derecha (con etiqueta al pasar el mouse, como el resto de la barra). */
const AccountTrigger = forwardRef<HTMLButtonElement, TriggerProps>(({ user, ready, className, ...props }, ref) => {
  const label = user ? displayName(user).split(" ")[0] : "Ingresar";
  return (
    <Hint label={user ? "Tu cuenta" : "Iniciar sesión con Google"}>
      <button
        ref={ref}
        type="button"
        aria-label={user ? `Tu cuenta: ${displayName(user)}` : "Iniciar sesión"}
        className={cn(
          "floating-ink pointer-events-auto flex h-[50px] shrink-0 items-center gap-2 rounded-full p-1.5 transition-transform hover:scale-[1.02] active:scale-[0.98] data-[state=open]:scale-100 md:pr-4",
          className
        )}
        {...props}
      >
        {ready ? (
          <UserAvatar user={user} size={36} />
        ) : (
          <span className="block h-9 w-9 shrink-0 animate-pulse rounded-full bg-cream/15" />
        )}
        <span className="hidden max-w-[7rem] truncate text-sm font-semibold tracking-tight md:inline">
          {ready ? label : "Cuenta"}
        </span>
      </button>
    </Hint>
  );
});
AccountTrigger.displayName = "AccountTrigger";

export function AccountPill() {
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  if (!account) return null;
  const { user, ready, available, signIn, signOut } = account;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <AccountTrigger user={user} ready={ready} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {user ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <UserAvatar user={user} size={44} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{displayName(user)}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <div className="rounded-xl bg-secondary/70 p-3">
              <p className="mb-1.5 text-xs font-medium">Se guarda en tu cuenta</p>
              <SyncedList />
            </div>
            <button
              type="button"
              onClick={() => run(signOut)}
              disabled={busy}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-full border text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Cerrar sesión
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <UserAvatar user={null} size={44} />
              <div>
                <p className="text-sm font-semibold">Iniciá sesión</p>
                <p className="text-xs text-muted-foreground">Lo tuyo, en cualquier computadora.</p>
              </div>
            </div>
            <SyncedList />
            {available ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => run(signIn)}
                  disabled={busy || !ready}
                  className="flex h-10 w-full items-center justify-center gap-2.5 rounded-full border bg-white text-sm font-medium shadow-sm transition-colors hover:bg-secondary disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
                  Continuar con Google
                </button>
                <p className="text-center text-[11px] text-muted-foreground">Con tu cuenta @{STUDIO_DOMAIN}</p>
              </div>
            ) : (
              <p className="rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
                El inicio de sesión todavía no está configurado: faltan las variables de Supabase.
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Sin cuenta podés usar todo igual: lo tuyo queda guardado solo en este navegador.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SyncedList() {
  return (
    <ul className="space-y-1.5 text-xs text-muted-foreground">
      {SYNCED.map((item) => (
        <li key={item} className="flex items-center gap-2">
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> {item}
        </li>
      ))}
    </ul>
  );
}

/** La "G" de Google, como pide su guía de marca para los botones de inicio de sesión. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
