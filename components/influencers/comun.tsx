"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BadgeCheck, Briefcase, DatabaseZap, Globe, Megaphone, PlugZap, Users } from "lucide-react";
import { ClientMark } from "@/components/clients/ClientMark";
import { SocialIcon } from "@/components/clients/SocialIcon";
import { BarSegmented } from "@/components/shell/ContextBar";
import { initials } from "@/lib/clients/color";
import { nombreRed, redSocial, type Perfil } from "@/lib/influencity/tipos";
import type { Brand } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Las pestañas del módulo, en la barra de arriba. */
const PESTANAS = [
  { value: "/influencers", label: "Influencers", icon: Users },
  { value: "/influencers/clientes", label: "Clientes", icon: Briefcase },
  { value: "/influencers/campanas", label: "Campañas", icon: Megaphone },
  { value: "/influencers/influencity", label: "Influencity", icon: PlugZap },
] as const;

type Pestana = (typeof PESTANAS)[number]["value"];

export function InfluencersNav() {
  const router = useRouter();
  const pathname = usePathname();
  const actual = (PESTANAS.find((p) => p.value !== "/influencers" && pathname.startsWith(p.value))?.value ?? "/influencers") as Pestana;
  return <BarSegmented<Pestana> label="Secciones de Influencers" value={actual} onChange={(v) => router.push(v)} options={PESTANAS.map((p) => ({ ...p }))} />;
}

/** El encabezado de cada pestaña: título en serif y una línea de qué es. */
export function Encabezado({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="mb-6 text-center">
      <h1 className="font-display text-4xl leading-none tracking-[-0.01em] sm:text-5xl">{titulo}</h1>
      {children && <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

export function RedIcon({ red, className }: { red: string | null | undefined; className?: string }) {
  const social = redSocial(red);
  if (social) return <SocialIcon network={social} className={className} />;
  return <Globe aria-hidden className={cn("h-4 w-4 shrink-0", className)} />;
}

/** La foto del perfil o, si no hay (o el link de la red venció), sus iniciales. */
export function Foto({ perfil, className }: { perfil: Pick<Perfil, "foto_url" | "usuario" | "nombre">; className?: string }) {
  const [rota, setRota] = useState(false);
  if (perfil.foto_url && !rota) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={perfil.foto_url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setRota(true)}
        className={cn("h-9 w-9 shrink-0 rounded-full bg-secondary object-cover", className)}
      />
    );
  }
  return (
    <span aria-hidden className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground", className)}>
      {initials(perfil.nombre || perfil.usuario)}
    </span>
  );
}

/** Nombre, @usuario y red, en una línea o dos. */
export function NombrePerfil({ perfil, className }: { perfil: Pick<Perfil, "nombre" | "usuario" | "red" | "verificado">; className?: string }) {
  return (
    <span className={cn("min-w-0", className)}>
      <span className="flex items-center gap-1 truncate font-medium">
        <span className="truncate">{perfil.nombre || `@${perfil.usuario}`}</span>
        {perfil.verificado && <BadgeCheck aria-label="Verificado" className="h-3.5 w-3.5 shrink-0 text-sky-600" />}
      </span>
      <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
        <RedIcon red={perfil.red} className="h-3 w-3" />
        <span className="sr-only">{nombreRed(perfil.red)}</span>
        <span className="truncate">@{perfil.usuario}</span>
      </span>
    </span>
  );
}

/** El logo chiquito de un cliente con su nombre. */
export function ClienteChip({ brand, className, href }: { brand: Brand; className?: string; href?: string }) {
  const cuerpo = (
    <>
      <ClientMark brand={brand} className="h-5 w-5 rounded-full text-[8px]" photoPad="" />
      <span className="truncate">{brand.name}</span>
    </>
  );
  const cls = cn("inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border bg-card py-0.5 pl-0.5 pr-2 text-xs font-medium", className);
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-foreground/30")}>
      {cuerpo}
    </Link>
  ) : (
    <span className={cls}>{cuerpo}</span>
  );
}

export function Card({ title, hint, action, children, className }: { title: string; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border bg-card p-5 shadow-sm", className)} aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-3xl border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-none tracking-tight sm:text-3xl">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Lo que falta para que el módulo funcione: la migración o la conexión. */
export function Aviso({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl bg-primary/25 px-4 py-3 text-sm", className)}>
      <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function FaltaMigracion({ className }: { className?: string }) {
  return (
    <Aviso className={className}>
      Falta un paso en la base: correr <code className="rounded bg-ink/10 px-1 text-[12px]">supabase/migracion-influencers.sql</code> en Supabase → SQL
      Editor.
    </Aviso>
  );
}

export function SinConexion({ className }: { className?: string }) {
  return (
    <Aviso className={className}>
      Influencity todavía no está conectado.{" "}
      <Link href="/influencers/influencity" className="font-semibold underline underline-offset-2">
        Conectalo con el token de la API
      </Link>{" "}
      y se traen las campañas, publicaciones e influencers.
    </Aviso>
  );
}

/** Selector chico de período, para usar dentro de la página (no en la barra). */
export function Pildoras<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
            value === o.value ? "border-ink bg-ink text-cream" : "bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
