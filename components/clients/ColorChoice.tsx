"use client";

import { Pipette } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { isVeryLight, normalizeHex, PRESET_COLORS } from "@/lib/clients/color";
import { cn } from "@/lib/utils";

/**
 * Elegir el color que identifica a un cliente: los del logo (si hay), los de
 * siempre o cualquiera con el selector del sistema.
 */
export function ColorChoice({
  value,
  onChange,
  suggested = [],
  extra = [],
}: {
  value: string;
  onChange: (hex: string) => void;
  /** Sacados del logo. */
  suggested?: string[];
  /** Otros para ofrecer (ej: la paleta del cliente). */
  extra?: string[];
}) {
  const current = normalizeHex(value) ?? value;
  const seen = new Set<string>();
  const uniq = (list: string[]) =>
    list
      .map((c) => normalizeHex(c))
      .filter((c): c is string => !!c && !seen.has(c) && !!seen.add(c));
  const fromLogo = uniq(suggested);
  const others = uniq([...extra, ...PRESET_COLORS]);
  const custom = !seen.has(current);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {fromLogo.map((c) => (
        <Swatch key={c} color={c} active={c === current} onClick={() => onChange(c)} label={`${c} · del logo`} />
      ))}
      {fromLogo.length > 0 && <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />}
      {others.map((c) => (
        <Swatch key={c} color={c} active={c === current} onClick={() => onChange(c)} label={c} />
      ))}
      <Hint label="Otro color">
        <label
          className={cn(
            "relative grid h-7 w-7 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110 focus-within:ring-2 focus-within:ring-ring",
            custom && "ring-2 ring-foreground"
          )}
          style={{
            background: custom
              ? current
              : "conic-gradient(from 90deg, #f43f5e, #f59e0b, #84cc16, #06b6d4, #6366f1, #d946ef, #f43f5e)",
          }}
        >
          <Pipette className="h-3.5 w-3.5 text-white drop-shadow" />
          <input
            type="color"
            value={current.length === 7 ? current.toLowerCase() : "#000000"}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            aria-label="Elegir otro color"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </Hint>
    </div>
  );
}

function Swatch({ color, active, onClick, label }: { color: string; active: boolean; onClick: () => void; label: string }) {
  return (
    <Hint label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "h-7 w-7 rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110",
          active && "ring-2 ring-foreground",
          isVeryLight(color) && "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]"
        )}
        style={{ background: color }}
      />
    </Hint>
  );
}
