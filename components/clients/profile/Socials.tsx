"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Loader2, Plus, X } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { Hint } from "@/components/ui/tooltip";
import {
  parseSocial,
  SOCIAL_NETWORKS,
  socialKey,
  socialLabel,
  socialName,
  socialUrl,
  type BrandSocial,
  type SocialNetwork,
} from "@/lib/clients/socials";
import type { BrandPatch } from "@/lib/repos/brands";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SocialIcon } from "../SocialIcon";

/** La foto de perfil de una cuenta, a través de la app (las redes no dejan pedirla desde el navegador). */
export const profilePhotoUrl = ({ network, handle }: BrandSocial) =>
  `/api/clientes/foto?red=${network}&cuenta=${encodeURIComponent(handle)}`;

/** Baja la foto de perfil como archivo, lista para subirla como logo. Si no se puede, el error dice por qué. */
export async function fetchProfilePhoto(account: BrandSocial): Promise<File> {
  const res = await fetch(profilePhotoUrl(account));
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `No se pudo traer la foto de ${socialName(account.network)}.`);
  }
  const blob = await res.blob();
  const ext = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1] || "jpg";
  return new File([blob], `${account.network}-${account.handle.replace(/[^a-z0-9._-]+/gi, "-")}.${ext}`, { type: blob.type });
}

/* ───────── las cuentas ───────── */

/**
 * Las redes del cliente: se suman pegando el link al perfil (la red sale del link) o escribiendo el
 * usuario y eligiendo la red. Se guardan al toque.
 */
export function SocialsField({
  brand,
  save,
  missing,
}: {
  brand: Brand;
  save: (patch: BrandPatch, done?: string) => Promise<boolean>;
  /** La base todavía no tiene las redes (falta migracion-redes.sql). */
  missing: boolean;
}) {
  const socials = brand.socials ?? [];
  const [adding, setAdding] = useState(false);

  const add = async (account: BrandSocial) => {
    if (socials.some((s) => socialKey(s) === socialKey(account))) {
      toast(`${socialLabel(account)} ya está en sus redes`);
      return true;
    }
    return save({ socials: [...socials, account] }, `${socialName(account.network)}: ${socialLabel(account)}`);
  };

  const remove = (account: BrandSocial) =>
    save({ socials: socials.filter((s) => socialKey(s) !== socialKey(account)) }, `${socialLabel(account)} quitada de sus redes`);

  return (
    <div className="mt-6">
      <p className="eyebrow mb-2">Redes</p>
      {missing ? (
        <p className="text-sm text-muted-foreground">
          Para guardar sus redes falta correr <code className="rounded bg-ink/10 px-1 text-[13px]">supabase/migracion-redes.sql</code> en Supabase.
        </p>
      ) : (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Sus redes">
          {socials.map((s) => (
            <li
              key={socialKey(s)}
              className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-black/[0.06] bg-card pl-2.5 pr-1 text-sm shadow-sm"
            >
              <SocialIcon network={s.network} className="h-3.5 w-3.5" />
              <a
                href={socialUrl(s)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate underline-offset-2 hover:underline"
                title={`Abrir en ${socialName(s.network)}`}
              >
                {socialLabel(s)}
                <span className="sr-only"> en {socialName(s.network)}</span>
              </a>
              <button
                type="button"
                onClick={() => remove(s)}
                aria-label={`Quitar ${socialLabel(s)} de ${socialName(s.network)}`}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          <li className={cn(adding && "basis-full")}>
            {adding ? (
              <AddSocial onAdd={add} onClose={() => setAdding(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-foreground/20 px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> {socials.length ? "Sumar otra" : "Sumar una red"}
              </button>
            )}
          </li>
        </ul>
      )}
    </div>
  );
}

function AddSocial({ onAdd, onClose }: { onAdd: (account: BrandSocial) => Promise<boolean>; onClose: () => void }) {
  const [text, setText] = useState("");
  const [network, setNetwork] = useState<SocialNetwork>("instagram");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  // Un link dice de qué red es: se marca solo.
  const detected = parseSocial(text, network);
  const shown = detected?.network ?? network;

  const submit = async () => {
    const account = parseSocial(text, network);
    if (!account) {
      setProblem(
        text.trim()
          ? `No entendí esa cuenta. Pegá el link al perfil o escribí el usuario de ${socialName(network)}.`
          : "Pegá el link al perfil o escribí el usuario."
      );
      input.current?.focus();
      return;
    }
    setBusy(true);
    const sent = text;
    const ok = await onAdd(account);
    setBusy(false);
    if (!ok) return;
    // Si mientras se guardaba se escribió otra, queda.
    setText((now) => (now === sent ? "" : now));
    setProblem(null);
    input.current?.focus();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="rounded-2xl border border-black/[0.06] bg-card/80 p-2"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="radiogroup" aria-label="Red" className="flex items-center gap-0.5 rounded-full bg-secondary/70 p-0.5">
          {SOCIAL_NETWORKS.map((n) => (
            <Hint key={n.id} label={n.name}>
              <button
                type="button"
                role="radio"
                aria-checked={shown === n.id}
                aria-label={n.name}
                onClick={() => {
                  setNetwork(n.id);
                  setProblem(null);
                  input.current?.focus();
                }}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
                  shown === n.id && "bg-card text-foreground shadow-sm"
                )}
              >
                <SocialIcon network={n.id} className="h-3.5 w-3.5" />
              </button>
            </Hint>
          ))}
        </div>
        <input
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setProblem(null);
          }}
          aria-label={`Link o usuario de ${socialName(shown)}`}
          aria-invalid={!!problem}
          aria-describedby={problem ? "redes-problema" : undefined}
          placeholder={`@usuario o link de ${socialName(shown)}`}
          className="h-8 min-w-[10rem] flex-1 rounded-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Sumar
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {problem && (
        <p id="redes-problema" role="alert" className="px-2 pb-1 pt-1.5 text-xs text-destructive">
          {problem}
        </p>
      )}
    </form>
  );
}

/* ───────── la foto de perfil como logo ───────── */

/**
 * Debajo del logo: cada cuenta con su foto de perfil, para usarla como logo con un click (como un
 * checkbox). La marcada es la que es el logo ahora; desmarcarla quita el logo.
 */
export function LogoFromSocials({
  brand,
  picking,
  onPick,
  onClear,
}: {
  brand: Brand;
  /** La cuenta cuya foto se está subiendo. */
  picking: string | null;
  onPick: (account: BrandSocial) => void;
  onClear: () => void;
}) {
  const socials = brand.socials ?? [];
  if (!socials.length) {
    return brand.logo_url ? null : (
      <p className="mt-2 text-xs text-muted-foreground">¿No tenés el logo? Sumá sus redes y usá su foto de perfil.</p>
    );
  }

  return (
    <div className="mt-4" role="group" aria-labelledby="logo-de-redes">
      <p id="logo-de-redes" className="eyebrow mb-2">
        {brand.logo_url ? "O su foto de perfil" : "Usar su foto de perfil"}
      </p>
      <ul className="grid gap-1.5">
        {socials.map((s) => {
          const key = socialKey(s);
          return (
            <li key={key}>
              <PhotoOption
                account={s}
                checked={brand.logo_from === key}
                busy={picking === key}
                disabled={!!picking}
                onToggle={() => (brand.logo_from === key ? onClear() : onPick(s))}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Menos que esto se ve borroso en la ficha. */
const SMALL = 200;

function PhotoOption({
  account,
  checked,
  busy,
  disabled,
  onToggle,
}: {
  account: BrandSocial;
  checked: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const [state, setState] = useState<"loading" | "error" | number>("loading");
  const src = profilePhotoUrl(account);
  const label = socialLabel(account);
  const name = socialName(account.network);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Foto de perfil de ${label} en ${name}`}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border bg-card/80 py-1.5 pl-1.5 pr-3 text-left transition-colors hover:bg-card disabled:cursor-wait",
        checked ? "border-foreground/50" : "border-black/[0.06]"
      )}
    >
      <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
        {state === "error" ? (
          <CircleAlert className="h-4 w-4 text-muted-foreground" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            onLoad={(e) => setState(e.currentTarget.naturalWidth)}
            onError={() => setState("error")}
            className={cn("h-full w-full object-cover transition-opacity", state === "loading" && "opacity-0")}
          />
        )}
        {state === "loading" && <span className="skeleton absolute inset-0" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <SocialIcon network={account.network} className="h-3.5 w-3.5" />
          <span className="truncate">{label}</span>
        </span>
        <span className={cn("block text-xs", typeof state === "number" && state < SMALL ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
          {state === "loading"
            ? `Buscando en ${name}…`
            : state === "error"
              ? "No se pudo leer: tocá para ver por qué"
              : state < SMALL
                ? `${state} px: ${name} la da chica, se puede ver borrosa`
                : `${state} px`}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors",
          checked ? "border-foreground bg-foreground text-background" : "border-foreground/25"
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin text-foreground" /> : checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}
