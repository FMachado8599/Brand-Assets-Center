"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, PenLine, Sparkles, StickyNote, Trash2, Upload, X } from "lucide-react";
import { MissingConfig } from "@/components/board/MissingConfig";
import { useData } from "@/components/data/DataProvider";
import { BarButton, BarDivider, ContextBar } from "@/components/shell/ContextBar";
import { useConfirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toaster";
import { Hint } from "@/components/ui/tooltip";
import { useBrandKits } from "@/hooks/useBrandKits";
import { useBrandMaterials } from "@/hooks/useBrandMaterials";
import { invalidarMaterialMarca } from "@/hooks/useMaterialMarca";
import { forgetClient, getClient, refreshClients, rememberClient, useClients } from "@/hooks/useClients";
import { useRedacciones } from "@/hooks/useRedacciones";
import { brandsRepo, clientErrorMessage, type BrandPatch } from "@/lib/repos/brands";
import { materialsRepo } from "@/lib/repos/materials";
import { LOGO_ACCEPT, logoProblem } from "@/lib/clients/logo";
import { hasSupabase } from "@/lib/supabase";
import type { Brand, LogoBg } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ClientMark, logoBackground } from "./ClientMark";
import { ColorChoice } from "./ColorChoice";
import { LogoDrop } from "./LogoDrop";
import { FontsSection } from "./profile/FontsSection";
import { MaterialSection } from "./profile/MaterialSection";
import { PaletteSection } from "./profile/PaletteSection";
import { MigrationNotice } from "./profile/Section";
import { CardsSection, KitSection, ProductsSection, RedaccionesSection } from "./profile/WorkSections";

const SAVE_DELAY = 600;

/**
 * La ficha de un cliente: todo lo suyo en un solo lugar. Lo que es de la
 * marca (logo, colores, tipografías, notas, productos) se edita acá mismo;
 * lo que se hace para ella (tarjetas, redacciones, emojis y hashtags) se ve
 * acá y se abre en su módulo.
 */
export function ClientProfile({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { clients, loading, hasProfile } = useClients();
  const { cards, products, fonts, reload, loading: dataLoading } = useData();
  const redacciones = useRedacciones();
  const kits = useBrandKits();
  const materials = useBrandMaterials(id);
  const brand = clients.find((c) => c.id === id) ?? null;
  const leaving = useRef(false);

  useEffect(() => {
    if (brand) document.title = `${brand.name} · Clientes · Herramientas`;
  }, [brand?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───────── guardar ─────────
     Los cambios se ven al instante (en esta ficha y en el resto de la app) y
     se guardan atrás. Lo que se toca seguido (colores, notas) se agrupa en un
     solo pedido. Si la base dice que no, se vuelve a leer lo que hay. */

  const persist = useCallback(
    async (patch: BrandPatch, done?: string) => {
      const { error } = await brandsRepo.update(id, patch);
      if (error) {
        toast(clientErrorMessage(error), "error");
        await refreshClients();
        return false;
      }
      // Por si en el medio se volvió a leer la lista (ej: al agregar un producto) y trajo lo de antes.
      const current = getClient(id);
      if (current) rememberClient({ ...current, ...patch });
      if (done) toast(done);
      return true;
    },
    [id]
  );

  const save = useCallback(
    async (patch: BrandPatch, done?: string) => {
      const current = getClient(id);
      if (!current) return false;
      rememberClient({ ...current, ...patch });
      return persist(patch, done);
    },
    [id, persist]
  );

  const pending = useRef<BrandPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length) persist(patch);
  }, [persist]);

  const saveSoon = useCallback(
    (patch: BrandPatch) => {
      const current = getClient(id);
      if (!current) return;
      rememberClient({ ...current, ...patch });
      pending.current = { ...pending.current, ...patch };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY);
    },
    [id, flush]
  );

  // Al irse de la ficha (o cerrar la pestaña) se guarda lo que quedaba pendiente.
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  /* ───────── lo que tiene a su nombre ───────── */

  const own = useMemo(
    () => ({
      cards: cards.filter((c) => c.brand_id === id),
      products: products.filter((p) => p.brand_id === id),
      redacciones: redacciones.items.filter((r) => r.brandId === id),
    }),
    [cards, products, redacciones.items, id]
  );

  const remove = async () => {
    if (!brand) return;
    const sure = await confirm({
      title: `¿Eliminar ${brand.name}?`,
      description:
        "Se borran su ficha, su logo y sus productos. Las tarjetas y las redacciones no se borran: quedan sin cliente. No se puede deshacer.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!sure) return;
    // Los archivos del material hay que anotarlos antes: al borrar el cliente la base borra también sus filas.
    const materialFiles = await materialsRepo.filePaths(id);
    const { error } = await brandsRepo.remove(id);
    if (error) return toast(clientErrorMessage(error), "error");
    brandsRepo.removeLogoFile(brand.logo_path);
    if (materialFiles.length) materialsRepo.removeFiles(materialFiles);
    invalidarMaterialMarca(id);
    leaving.current = true;
    pending.current = {};
    router.push("/clientes");
    forgetClient(id);
    reload();
    toast(`${brand.name} eliminado`);
  };

  if (!hasSupabase) return <MissingConfig />;

  const bar = (
    <ContextBar>
      <BarButton label="Todos los clientes" icon={ArrowLeft} onClick={() => router.push("/clientes")} />
      {brand && (
        <>
          <BarDivider />
          <span className="flex max-w-[11rem] items-center gap-2 px-1.5 md:max-w-[16rem]">
            <ClientMark brand={brand} className="h-7 w-7 rounded-full text-xs" pad="p-[18%]" />
            <span className="hidden truncate text-sm font-semibold tracking-tight text-cream sm:inline">{brand.name}</span>
          </span>
          <BarDivider />
          <BarButton label="Nueva tarjeta" icon={StickyNote} onClick={() => router.push(`/tarjetas?nueva=${id}`)} />
          <BarButton label="Nueva redacción" icon={PenLine} onClick={() => router.push(`/redaccion?cliente=${id}`)} />
        </>
      )}
    </ContextBar>
  );

  if (!brand) {
    if (leaving.current) return bar;
    return (
      <>
        {bar}
        <main className="mx-auto flex max-w-md flex-col items-center px-4 pb-16 pt-40 text-center">
          {loading ? (
            <span className="skeleton block h-10 w-48 rounded-full" />
          ) : (
            <>
              <p className="eyebrow">Clientes</p>
              <h1 className="mt-3 font-display text-4xl">No encontramos ese cliente</h1>
              <p className="mt-2 text-sm text-muted-foreground">Puede que lo hayan eliminado.</p>
              <Link
                href="/clientes"
                className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95"
              >
                <ArrowLeft className="h-4 w-4" /> Ver todos
              </Link>
            </>
          )}
        </main>
      </>
    );
  }

  return (
    <>
      {bar}
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-[5.5rem] sm:px-6">
        {hasProfile === false && <MigrationNotice className="mb-6" />}

        <ProfileHeader
          brand={brand}
          save={save}
          saveSoon={saveSoon}
          stats={[
            ["#tarjetas", own.cards.length, "tarjeta", "tarjetas"],
            ["#productos", own.products.length, "producto", "productos"],
            ["#tipografias", brand.font_families?.length ?? 0, "tipografía", "tipografías"],
            ["#redacciones", own.redacciones.length, "redacción tuya", "redacciones tuyas"],
            ...(materials.missing ? [] : ([["#material", materials.items.length, "archivo de marca", "archivos de marca"]] as [string, number, string, string][])),
          ]}
        />

        <div className="mt-8 grid gap-4">
          <PaletteSection brand={brand} saveSoon={saveSoon} />
          <FontsSection brand={brand} fonts={fonts} save={save} onUploaded={reload} />
          <MaterialSection brand={brand} materials={materials} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CardsSection brand={brand} cards={own.cards} products={products} />
            <RedaccionesSection brand={brand} items={own.redacciones} />
            <ProductsSection brand={brand} products={own.products} cards={own.cards} reload={reload} />
            <KitSection brand={brand} kit={kits.kitOf(id)} />
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-foreground/10 pt-6">
          <p className="text-xs text-muted-foreground">
            {dataLoading ? "Cargando…" : `Cliente desde el ${new Date(brand.created_at).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}.`}
          </p>
          <button
            type="button"
            onClick={remove}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" /> Eliminar cliente
          </button>
        </div>
      </main>
    </>
  );
}

const BACKGROUNDS: { value: LogoBg; label: string }[] = [
  { value: "light", label: "Fondo claro" },
  { value: "dark", label: "Fondo oscuro" },
  { value: "brand", label: "Fondo de su color" },
];

/** Arriba de todo: el logo, el nombre, su color, cuánto tiene a su nombre y las notas. */
function ProfileHeader({
  brand,
  save,
  saveSoon,
  stats,
}: {
  brand: Brand;
  save: (patch: BrandPatch, done?: string) => Promise<boolean>;
  saveSoon: (patch: BrandPatch) => void;
  stats: [string, number, string, string][];
}) {
  const [logoBusy, setLogoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const changeLogo = async (file: File) => {
    setLogoBusy(true);
    const up = await brandsRepo.uploadLogo(file);
    if (up.error) {
      toast(clientErrorMessage(up.error), "error");
      setLogoBusy(false);
      return;
    }
    const old = brand.logo_path;
    const ok = await save({ logo_url: up.url, logo_path: up.path }, brand.logo_url ? "Logo cambiado" : "Logo agregado");
    brandsRepo.removeLogoFile(ok ? old : up.path);
    setLogoBusy(false);
  };

  const removeLogo = async () => {
    const old = brand.logo_path;
    if (await save({ logo_url: null, logo_path: null }, "Logo quitado")) brandsRepo.removeLogoFile(old);
  };

  const downloadLogo = async () => {
    if (!brand.logo_url) return;
    const ext = brand.logo_url.split("?")[0].split(".").pop() ?? "png";
    try {
      const blob = await (await fetch(brand.logo_url)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${brand.name} logo.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.open(brand.logo_url, "_blank", "noopener");
    }
  };

  const tool =
    "grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

  return (
    <header className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr] md:gap-10">
      <div>
        <LogoDrop
          preview={brand.logo_url ?? null}
          background={logoBackground(brand)}
          onFile={changeLogo}
          busy={logoBusy}
          hint="Soltá el logo acá o hacé click · SVG, PNG o JPG"
          className="aspect-[4/3] w-full rounded-[1.75rem]"
        />
        {brand.logo_url && (
          <div className="mt-2 flex items-center gap-1">
            <div role="radiogroup" aria-label="Fondo del logo" className="flex items-center gap-1 rounded-full bg-secondary/70 p-1">
              {BACKGROUNDS.map((b) => (
                <Hint key={b.value} label={b.label}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={(brand.logo_bg ?? "light") === b.value}
                    aria-label={b.label}
                    onClick={() => save({ logo_bg: b.value })}
                    className={cn(
                      "h-6 w-6 rounded-full ring-1 ring-inset ring-black/15 ring-offset-2 ring-offset-secondary transition-transform hover:scale-110",
                      (brand.logo_bg ?? "light") === b.value && "ring-2 ring-foreground"
                    )}
                    style={{ background: logoBackground(brand, b.value) }}
                  />
                </Hint>
              ))}
            </div>
            <span className="flex-1" />
            <Hint label="Descargar el logo">
              <button type="button" onClick={downloadLogo} aria-label="Descargar el logo" className={tool}>
                <Download className="h-4 w-4" />
              </button>
            </Hint>
            <Hint label="Cambiar el logo">
              <button type="button" onClick={() => fileInput.current?.click()} aria-label="Cambiar el logo" className={tool}>
                <Upload className="h-4 w-4" />
              </button>
            </Hint>
            <Hint label="Quitar el logo">
              <button type="button" onClick={removeLogo} aria-label="Quitar el logo" className={tool}>
                <X className="h-4 w-4" />
              </button>
            </Hint>
            <input
              ref={fileInput}
              type="file"
              accept={LOGO_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const problem = logoProblem(file);
                if (problem) toast(problem, "error");
                else changeLogo(file);
              }}
            />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col">
        <p className="eyebrow">
          Cliente <span className="text-primary">\</span>
        </p>
        <NameInput key={`nombre-${brand.id}`} name={brand.name} onSave={(name) => save({ name })} />

        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {stats.map(([href, n, one, many]) => (
            <a key={href} href={href} className={cn("transition-colors hover:text-foreground", !n && "opacity-60")}>
              <strong className="font-semibold tabular-nums text-foreground">{n}</strong> {n === 1 ? one : many}
            </a>
          ))}
        </p>

        <div className="mt-6">
          <p className="eyebrow mb-2">Su color en las listas</p>
          <ColorChoice
            value={brand.color}
            extra={(brand.palette ?? []).map((c) => c.hex)}
            onChange={(color) => saveSoon({ color })}
          />
        </div>

        <Notes key={`notas-${brand.id}`} value={brand.notes ?? ""} onChange={(notes) => saveSoon({ notes })} />
      </div>
    </header>
  );
}

/** El nombre, editable en el lugar: se guarda al salir o con Enter; Esc lo deja como estaba. */
function NameInput({ name, onSave }: { name: string; onSave: (name: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  const commit = async () => {
    const next = draft?.trim() ?? "";
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (next && next !== name) await onSave(next);
  };

  return (
    <input
      value={draft ?? name}
      onFocus={() => setDraft(name)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      maxLength={80}
      aria-label="Nombre del cliente"
      className="-mx-2 mt-1 w-[calc(100%+1rem)] min-w-0 truncate rounded-2xl bg-transparent px-2 font-display text-[clamp(2.75rem,7vw,4.75rem)] leading-[1.05] tracking-[-0.015em] outline-none transition-colors hover:bg-secondary/50 focus:bg-secondary/70"
    />
  );
}

/** Notas libres: tono, contactos, links, lo que haga falta tener a mano. Se guardan solas. */
function Notes({ value, onChange }: { value: string; onChange: (notes: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  // Si cambian desde otro lado (ej: se volvió a leer la lista), se toman solo cuando no se está escribiendo.
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  // Crece con el texto.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
  }, [draft]);

  return (
    <label className="mt-6 block">
      <span className="flex flex-wrap items-baseline gap-x-3">
        <span className="eyebrow">Notas</span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" aria-hidden /> La IA de Redacción las lee al escribir
        </span>
      </span>
      <textarea
        ref={area}
        value={draft}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
        maxLength={20000}
        placeholder="Tono de voz, contactos, links al drive, lo que no hay que olvidar…"
        className="mt-2 block w-full resize-none rounded-2xl border border-black/[0.06] bg-card/80 px-4 py-3 text-[15px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:bg-card focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0"
      />
    </label>
  );
}
