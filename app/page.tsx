import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AccountCta } from "@/components/site/AccountCta";
import { SiteFooter } from "@/components/site/SiteFooter";
import { MODULES } from "@/lib/modules";
import { STUDIO } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `Herramientas · ${STUDIO}` },
  description: "Las herramientas internas del estudio: tarjetas con tipografía, emojis, GIFs, conversor de archivos y redacción.",
};

const TOOLS = MODULES.filter((m) => m.href !== "/" && !m.soon);

const SYNCED = [
  "Favoritos y recientes de emojis",
  "Los ajustes de cada herramienta",
  "Tus redacciones, con los emojis y hashtags de cada cliente",
  "Las tarjetas que creás, a tu nombre",
];

const two = (n: number) => String(n).padStart(2, "0");

export default function InicioPage() {
  return (
    <div className="bg-ink">
      {/* Portada */}
      <section className="grain flex min-h-[100svh] flex-col overflow-hidden bg-ink text-cream">
        <div
          aria-hidden
          className="site-light pointer-events-none absolute -left-[22%] -top-[35%] h-[85vmax] w-[85vmax] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.14),transparent)] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-[45%] -right-[25%] h-[65vmax] w-[65vmax] rounded-full bg-[radial-gradient(closest-side,rgba(255,212,0,0.07),transparent)] blur-3xl"
        />

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end px-5 pb-12 pt-32 sm:px-8 md:pb-16">
          <p className="site-label text-cream/60 duration-700 animate-in fade-in-0">
            {STUDIO} <span className="text-primary">\</span> Herramientas internas
          </p>
          <h1 className="mt-6 max-w-5xl font-display text-[clamp(3.25rem,10.5vw,9.5rem)] leading-[0.9] tracking-[-0.025em] duration-1000 animate-in fade-in-0 slide-in-from-bottom-6">
            Las herramientas del estudio, <em className="text-cream/50">en un solo lugar.</em>
          </h1>
          <div className="mt-10 grid gap-8 border-t border-cream/15 pt-8 delay-300 duration-1000 animate-in fade-in-0 fill-mode-backwards md:grid-cols-[1fr_auto] md:items-end">
            <p className="max-w-md text-[15px] leading-relaxed text-cream/65">
              Textos con su tipografía, emojis listos para pegar, banners animados, archivos convertidos y redacción para
              cada cliente. Hechas acá, para el trabajo de todos los días.
            </p>
            <AccountCta greet />
          </div>
        </div>
      </section>

      {/* Por qué */}
      <section className="bg-cream text-ink">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-24 sm:px-8 md:grid-cols-[12rem_1fr] md:gap-10 md:py-36">
          <p className="site-label pt-3 text-ink/50">Por qué</p>
          <p className="font-display text-[clamp(2rem,4.8vw,4rem)] leading-[1.04] tracking-[-0.015em]">
            Copiar un texto y perder la tipografía, buscar el mismo emoji por quinta vez o armar diez banners a mano no es
            trabajo creativo. <span className="text-ink/40">Es tiempo que no vuelve. Lo resolvimos una vez, para todo el equipo.</span>
          </p>
        </div>
      </section>

      {/* Herramientas */}
      <section id="herramientas" className="scroll-mt-16 bg-cream text-ink">
        <div className="mx-auto max-w-6xl px-5 pb-24 sm:px-8 md:pb-36">
          <div className="flex items-end justify-between pb-5">
            <p className="site-label text-ink/50">Herramientas</p>
            <p className="site-label tabular-nums text-ink/50">{two(TOOLS.length)}</p>
          </div>
          <ul className="border-t border-ink/20">
            {TOOLS.map((tool, i) => (
              <li key={tool.href} className="border-b border-ink/20">
                <Link href={tool.href} className="group relative flex items-center gap-4 overflow-hidden px-2 py-6 sm:gap-8 sm:px-4 sm:py-8">
                  {/* Al pasar el mouse, la fila se llena de negro desde abajo. */}
                  <span
                    aria-hidden
                    className="absolute inset-0 origin-bottom scale-y-0 bg-ink transition-transform duration-500 ease-smooth group-hover:scale-y-100 group-focus-visible:scale-y-100"
                  />
                  <span className="site-label relative w-7 shrink-0 tabular-nums text-ink/45 transition-colors duration-500 group-hover:text-cream/50 group-focus-visible:text-cream/50">
                    {two(i + 1)}
                  </span>
                  <span className="relative font-display text-[clamp(2.5rem,6.5vw,5.5rem)] leading-none tracking-[-0.02em] transition-[color,transform] duration-500 group-hover:translate-x-2 group-hover:text-cream group-focus-visible:text-cream">
                    {tool.label}
                  </span>
                  <span className="site-label relative ml-auto hidden max-w-[20rem] text-right leading-relaxed text-ink/55 transition-colors duration-500 group-hover:text-cream/60 group-focus-visible:text-cream/60 md:block">
                    {tool.description}
                  </span>
                  <ArrowUpRight className="relative ml-auto h-6 w-6 shrink-0 transition-[color,transform] duration-500 group-hover:rotate-45 group-hover:text-primary group-focus-visible:text-primary md:ml-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Tu cuenta */}
      <section className="grain bg-ink text-cream">
        <div className="relative z-10 mx-auto grid max-w-6xl gap-6 px-5 py-24 sm:px-8 md:grid-cols-[12rem_1fr] md:gap-10 md:py-32">
          <p className="site-label pt-3 text-cream/50">Tu cuenta</p>
          <div>
            <p className="max-w-4xl font-display text-[clamp(2rem,4.8vw,4rem)] leading-[1.04] tracking-[-0.015em]">
              Entrás una vez y lo tuyo te sigue <em className="text-cream/50">a cualquier computadora.</em>
            </p>
            <ul className="mt-10 grid gap-x-10 gap-y-3 border-t border-cream/15 pt-6 text-[15px] text-cream/70 sm:grid-cols-2">
              {SYNCED.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="text-primary">
                    \
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-12">
              <AccountCta />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
