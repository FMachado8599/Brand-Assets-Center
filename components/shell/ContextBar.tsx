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
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, Search, X, type LucideIcon } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
  const inner = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  const [empty, setEmpty] = useState(true);
  const [more, setMore] = useState(false);

  // ¿Queda contenido escondido a la derecha? Pasa en pantallas chicas.
  const checkOverflow = () => {
    const s = scroller.current;
    if (s) setMore(s.scrollWidth - s.clientWidth - s.scrollLeft > 2);
  };

  useLayoutEffect(() => {
    const el = inner.current!;
    onTarget(el);
    const measure = () => {
      const hasContent = el.childElementCount > 0;
      setEmpty(!hasContent);
      // Sin contenido conservamos el último ancho: entre una página y otra no queremos que colapse a cero.
      if (hasContent) setWidth(el.scrollWidth + 2);
      requestAnimationFrame(checkOverflow);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (scroller.current) ro.observe(scroller.current);
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true });
    measure();
    return () => {
      ro.disconnect();
      mo.disconnect();
      onTarget(null);
    };
  }, [onTarget]);

  return (
    <div
      role="toolbar"
      aria-label="Acciones de la sección"
      className={cn(
        "floating pointer-events-auto h-[50px] max-w-full overflow-hidden rounded-full transition-[width,opacity,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
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
        <div ref={inner} className="flex h-full w-max items-center p-1.5" />
      </div>
    </div>
  );
}

/* ───────────── Piezas de la barra ───────────── */

type BarButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon?: LucideIcon;
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
          "relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-35 data-[state=open]:bg-secondary data-[state=open]:text-foreground",
          (pressed || highlight) &&
            "bg-foreground text-background hover:bg-foreground/90 hover:text-background data-[state=open]:bg-foreground data-[state=open]:text-background",
          className
        )}
        {...props}
      >
        {glyph ?? (Icon && <Icon className="h-[18px] w-[18px]" />)}
        {badge !== undefined && badge !== 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground ring-2 ring-white">
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
  icon: LucideIcon;
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
  return <span aria-hidden className="mx-1 hidden h-5 w-px shrink-0 bg-border sm:block" />;
}

/** Texto chico dentro de la barra (contadores, estados). */
export function BarNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("hidden shrink-0 whitespace-nowrap px-2 text-xs tabular-nums text-muted-foreground md:inline", className)}>
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
  className?: string;
};

export const BarSearch = forwardRef<HTMLInputElement, BarSearchProps>(
  ({ value, onChange, placeholder = "Buscar…", onEnter, busy, shortcut = true, className }, ref) => {
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
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
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
          className="h-9 w-full rounded-full bg-secondary/80 pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:bg-secondary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 focus-visible:ring-offset-0"
        />
        {busy ? (
          <Loader2 className="pointer-events-none absolute right-3 h-4 w-4 animate-spin text-muted-foreground" />
        ) : value ? (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => {
              onChange("");
              input.current?.focus();
            }}
            className="absolute right-1.5 grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : shortcut ? (
          <kbd className="pointer-events-none absolute right-2.5 hidden h-5 place-items-center rounded border bg-card px-1.5 font-ui text-[10px] font-medium text-muted-foreground sm:grid">
            /
          </kbd>
        ) : null}
      </label>
    );
  }
);
BarSearch.displayName = "BarSearch";

type SegmentOption<T extends string> = { value: T; label: string; icon?: LucideIcon };

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
      className="relative flex h-9 shrink-0 items-center gap-0.5 rounded-full bg-secondary/80 p-0.5"
    >
      {pill && (
        <span
          aria-hidden
          className="absolute top-0.5 h-8 rounded-full bg-primary shadow-sm transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
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
            "relative z-10 flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60",
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
}: {
  label: string;
  icon?: LucideIcon;
  glyph?: ReactNode;
  badge?: number | string;
  highlight?: boolean;
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <BarButton label={label} icon={icon} glyph={glyph} badge={badge} highlight={highlight} />
      </PopoverTrigger>
      <PopoverContent align={align} className={className}>
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
