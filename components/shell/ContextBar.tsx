"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentType,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronRight, Loader2, Search, X, type LucideIcon } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { activeModule } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { usePaginaVolver, useVolver, type Destino } from "@/lib/volver";

/** Un ícono de lucide o uno propio (ej: el logo de Basecamp) que acepte className. */
export type BarIcon = LucideIcon | ComponentType<{ className?: string }>;

/**
 * Barra contextual: una sola píldora flotante que vive en el layout y cada
 * página llena con sus propias acciones vía <ContextBar>. Como el contenedor
 * persiste entre páginas, al navegar anima su ancho de una botonera a la
 * otra en lugar de desmontarse.
 */

const BarTargetContext = createContext<HTMLElement | null>(null);

export const BarTargetProvider = BarTargetContext.Provider;

/** Lo que cada página monta: sus controles se teletransportan a la barra. */
export function ContextBar({ children }: { children: ReactNode }) {
  const target = useContext(BarTargetContext);
  if (!target) return null;
  return createPortal(
    <div className="flex items-center gap-1 duration-300 animate-in fade-in-0 zoom-in-95">{children}</div>,
    target
  );
}

/** Desvanecido del borde derecho: avisa que la barra sigue y se puede deslizar. */
const FADE_RIGHT = "linear-gradient(to right, #000 calc(100% - 32px), transparent)";

export function ContextBarHost({ onTarget }: { onTarget: (el: HTMLElement | null) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  const [hasContent, setHasContent] = useState(false);
  const [more, setMore] = useState(false);
  // Cada herramienta arranca la barra con la flecha de volver; Inicio (y lo que no es una herramienta), no.
  const back = activeModule(usePathname()).href !== "/";
  const empty = !hasContent && !back;

  // ¿Queda contenido escondido a la derecha? Pasa en pantallas chicas.
  const checkOverflow = () => {
    const s = scroller.current;
    if (s) setMore(s.scrollWidth - s.clientWidth - s.scrollLeft > 2);
  };

  useLayoutEffect(() => {
    onTarget(inner.current);
    return () => onTarget(null);
  }, [onTarget]);

  useLayoutEffect(() => {
    const el = inner.current!;
    const measure = () => {
      const filled = el.childElementCount > 0;
      setHasContent(filled);
      // Sin contenido (ni flecha) conservamos el último ancho: entre una página y otra no queremos que colapse a cero.
      if (filled || back) setWidth(row.current!.scrollWidth + 2);
      requestAnimationFrame(checkOverflow);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(row.current!);
    if (scroller.current) ro.observe(scroller.current);
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true });
    measure();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [back]);

  return (
    <div
      role="toolbar"
      aria-label="Acciones de la sección"
      className={cn(
        "floating-ink pointer-events-auto h-[50px] max-w-full overflow-hidden rounded-full transition-[width,opacity,transform] duration-500 ease-smooth",
        empty && "pointer-events-none -translate-y-1 opacity-0"
      )}
      style={{ width }}
    >
      <div
        ref={scroller}
        onScroll={checkOverflow}
        className="no-scrollbar h-full overflow-x-auto"
        style={more ? { maskImage: FADE_RIGHT, WebkitMaskImage: FADE_RIGHT } : undefined}
      >
        <div ref={row} className="flex h-full w-max items-center p-1.5">
          {back && (
            <>
              <BackButton />
              {hasContent && <BarDivider />}
            </>
          )}
          <div ref={inner} className="flex h-full items-center" />
        </div>
      </div>
    </div>
  );
}

/**
 * La flecha del principio de la barra: vuelve a la pantalla anterior o, si se entró directo, sube un nivel
 * (ver lib/volver.ts). La pone la barra sola en cada herramienta: las páginas no la montan.
 */
function BackButton() {
  const { destino, volver } = useVolver();
  return <BarButton label={destino.titulo ? `Volver a ${destino.titulo}` : "Volver"} icon={ArrowLeft} onClick={volver} />;
}

/**
 * Migas: dónde está la pantalla dentro de su herramienta, para las que tienen niveles (la ficha de un
 * cliente, una presentación, las métricas de Descargas, un juego). Va primero en la barra, después de la
 * flecha: los niveles de arriba son links (en pantallas chicas se ocultan y queda la flecha) y el último,
 * `children`, es la pantalla abierta.
 *
 * El nivel de arriba (el último de `migas`) es a donde lleva la flecha si se entró directo, y `titulo` es
 * el nombre de esta pantalla para el "Volver a …" de la siguiente.
 */
export function BarMigas({
  migas,
  titulo,
  desde = "md",
  children,
}: {
  migas: Destino[];
  titulo?: string;
  /** Desde qué ancho se ven los niveles de arriba (donde la barra va llena, mejor más tarde). */
  desde?: "md" | "lg";
  children: ReactNode;
}) {
  usePaginaVolver({ titulo, padre: migas[migas.length - 1] });
  const arriba = desde === "lg" ? "hidden lg:flex" : "hidden md:flex";
  const separador = <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-cream/30" />;
  return (
    <nav aria-label="Estás en" className="flex shrink-0 items-center">
      <ol className="flex items-center">
        {migas.map((m, i) => (
          <li key={m.href} className={cn(arriba, "items-center")}>
            {i > 0 && separador}
            <Link
              href={m.href}
              className="flex h-9 items-center whitespace-nowrap rounded-full px-2.5 text-sm font-medium text-cream/55 transition-colors hover:bg-cream/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
            >
              {m.titulo}
            </Link>
          </li>
        ))}
        <li aria-current="page" className="flex items-center">
          {migas.length > 0 && <span className={cn(arriba, "items-center")}>{separador}</span>}
          {children}
        </li>
      </ol>
    </nav>
  );
}

/* ───────────── Piezas de la barra ───────────── */

type BarButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon?: BarIcon;
  /** Reemplaza al ícono cuando hace falta algo propio (ej: una muestra de color). */
  glyph?: ReactNode;
  /** Estado de un toggle: pinta el botón activo y expone aria-pressed. */
  pressed?: boolean;
  /** Pinta el botón activo sin semántica de toggle (ej: hay filtros aplicados). */
  highlight?: boolean;
  badge?: number | string;
};

export const BarButton = forwardRef<HTMLButtonElement, BarButtonProps>(
  ({ label, icon: Icon, glyph, pressed, highlight, badge, className, ...props }, ref) => (
    <Hint label={label}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          "relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream disabled:pointer-events-none disabled:opacity-35 data-[state=open]:bg-cream/15 data-[state=open]:text-cream",
          (pressed || highlight) &&
            "bg-cream text-ink hover:bg-cream/90 hover:text-ink data-[state=open]:bg-cream data-[state=open]:text-ink",
          className
        )}
        {...props}
      >
        {glyph ?? (Icon && <Icon className="h-[18px] w-[18px]" />)}
        {badge !== undefined && badge !== 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground ring-2 ring-ink">
            {badge}
          </span>
        )}
      </button>
    </Hint>
  )
);
BarButton.displayName = "BarButton";

type BarActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: BarIcon;
  /** En pantallas chicas la etiqueta se oculta y queda solo el ícono. */
  compact?: boolean;
};

/** La acción principal de la sección: amarilla y con texto. */
export const BarAction = forwardRef<HTMLButtonElement, BarActionProps>(
  ({ label, icon: Icon, compact = true, className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 md:px-4",
        className
      )}
      {...props}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className={cn("whitespace-nowrap", compact && "hidden md:inline")}>{children ?? label}</span>
    </button>
  )
);
BarAction.displayName = "BarAction";

export function BarDivider() {
  // En el celular cada píxel cuenta: los divisores se ocultan y la barra entra sin scrollear.
  return <span aria-hidden className="mx-1 hidden h-5 w-px shrink-0 bg-cream/15 sm:block" />;
}

/** Texto chico dentro de la barra (contadores, estados). */
export function BarNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("hidden shrink-0 whitespace-nowrap px-2 text-xs tabular-nums text-cream/55 md:inline", className)}>
      {children}
    </span>
  );
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

type BarSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Enter dentro del buscador (ej: copiar el primer resultado). */
  onEnter?: () => void;
  busy?: boolean;
  /** Atajo "/" para enfocar el buscador desde cualquier lado. */
  shortcut?: boolean;
  /** Reemplaza la lupa cuando el campo no es para buscar (ej: pegar un link). */
  icon?: BarIcon;
  className?: string;
};

export const BarSearch = forwardRef<HTMLInputElement, BarSearchProps>(
  ({ value, onChange, placeholder = "Buscar…", onEnter, busy, shortcut = true, icon: Icon = Search, className }, ref) => {
    const input = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => input.current!);

    useEffect(() => {
      if (!shortcut) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "/" && !e.metaKey && !e.ctrlKey && !isTyping(e.target)) {
          e.preventDefault();
          input.current?.focus();
          input.current?.select();
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [shortcut]);

    return (
      <label className={cn("relative flex h-9 w-[clamp(7rem,30vw,20rem)] shrink-0 items-center", className)}>
        <Icon className="pointer-events-none absolute left-3 h-4 w-4 text-cream/45" />
        <input
          ref={input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter?.();
            if (e.key === "Escape") {
              if (value) onChange("");
              else e.currentTarget.blur();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9 w-full rounded-full bg-cream/10 pl-9 pr-9 text-sm text-cream outline-none transition-colors placeholder:text-cream/40 focus:bg-cream/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 focus-visible:ring-offset-0"
        />
        {busy ? (
          <Loader2 className="pointer-events-none absolute right-3 h-4 w-4 animate-spin text-cream/50" />
        ) : value ? (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => {
              onChange("");
              input.current?.focus();
            }}
            className="absolute right-1.5 grid h-6 w-6 place-items-center rounded-full text-cream/55 hover:bg-cream/10 hover:text-cream"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : shortcut ? (
          <kbd className="pointer-events-none absolute right-2.5 hidden h-5 place-items-center rounded border border-cream/20 bg-cream/5 px-1.5 font-ui text-[10px] font-medium text-cream/50 sm:grid">
            /
          </kbd>
        ) : null}
      </label>
    );
  }
);
BarSearch.displayName = "BarSearch";

type SegmentOption<T extends string> = { value: T; label: string; icon?: BarIcon };

/** Selector de dos o tres opciones con una píldora amarilla que se desliza a la elegida. */
export function BarSegmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  disabled?: boolean;
  label?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const container = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number }>();

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[value];
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    // Si cambia el ancho (los íconos se ocultan en el celular), la píldora se reubica.
    const ro = new ResizeObserver(measure);
    if (container.current) ro.observe(container.current);
    return () => ro.disconnect();
  }, [value, options]);

  return (
    <div
      ref={container}
      role="tablist"
      aria-label={label}
      className="relative flex h-9 shrink-0 items-center gap-0.5 rounded-full bg-cream/10 p-0.5"
    >
      {pill && (
        <span
          aria-hidden
          className="absolute top-0.5 h-8 rounded-full bg-primary shadow-sm transition-all duration-300 ease-smooth"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[o.value] = el;
          }}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative z-10 flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-cream/60 transition-colors hover:text-cream disabled:cursor-not-allowed disabled:opacity-60",
            value === o.value && "text-primary-foreground hover:text-primary-foreground"
          )}
        >
          {o.icon && <o.icon className="hidden h-3.5 w-3.5 sm:block" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Botón de ícono que abre un panel flotante (filtros, configuración, guías). */
export function BarPopover({
  label,
  icon,
  glyph,
  badge,
  highlight,
  children,
  className,
  align = "center",
  open,
  onOpenChange,
  focusPanel,
}: {
  label: string;
  icon?: BarIcon;
  glyph?: ReactNode;
  badge?: number | string;
  highlight?: boolean;
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Al abrir, el foco queda en el panel y no en su primer control (que con tooltip lo mostraría de entrada). */
  focusPanel?: boolean;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <BarButton label={label} icon={icon} glyph={glyph} badge={badge} highlight={highlight} />
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={className}
        onOpenAutoFocus={
          focusPanel
            ? (e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement | null)?.focus();
              }
            : undefined
        }
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Título y bajada dentro de un popover de la barra. */
export function PanelTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
