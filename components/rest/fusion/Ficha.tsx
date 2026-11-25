import type { CSSProperties } from "react";
import { META, type Ficha } from "@/lib/rest/fusion";
import { cn } from "@/lib/utils";

/**
 * Cuánta tinta lleva cada ficha sobre el papel (en %): de casi blanca a negra a medida que crece. Las
 * casillas vacías son el tablero hundido, así que el 2 se despega de ellas como papel (igual que en el buscaminas).
 * 2048 es la amarilla del estudio. Con el modo noche se invierte sola: crema sobre oscuro.
 */
const TINTA: Record<number, number> = { 2: 3, 4: 11, 8: 22, 16: 34, 32: 46, 64: 58, 128: 70, 256: 80, 512: 90, 1024: 100 };

export function estiloFicha(valor: number): CSSProperties {
  if (valor === META) return { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" };
  if (valor > META) {
    return { background: "hsl(var(--foreground))", color: "hsl(var(--primary))", boxShadow: "inset 0 0 0 2px hsl(var(--primary))" };
  }
  const tinta = TINTA[valor] ?? 100;
  return {
    background: `color-mix(in srgb, hsl(var(--foreground)) ${tinta}%, hsl(var(--card)))`,
    color: valor === 1024 ? "hsl(var(--primary))" : tinta >= 45 ? "hsl(var(--card))" : "hsl(var(--foreground))",
  };
}

/** El tamaño del número (en % del ancho del tablero) según cuántas cifras tiene. */
const TAMAÑO = [0, 14, 13, 10.5, 8.5, 7, 6];
export const tamañoNumero = (valor: number) => TAMAÑO[Math.min(String(valor).length, TAMAÑO.length - 1)];

/**
 * Una ficha en el tablero: se ubica con translate (así se desliza con una transición) y el número,
 * adentro, aparece o salta con su propia animación. Va dentro de una caja del tamaño del tablero
 * que define --g (la junta entre casillas) y es el contenedor de los cqw. Chica: la de la tarjeta de /rest.
 */
export function FichaVista({ ficha, chica }: { ficha: Ficha; chica?: boolean }) {
  const lado = "calc((100% - 3 * var(--g)) / 4)";
  return (
    <div
      className="absolute left-0 top-0 transition-transform duration-100 ease-out"
      style={{
        width: lado,
        height: lado,
        transform: `translate(calc(${ficha.col} * (100% + var(--g))), calc(${ficha.fila} * (100% + var(--g))))`,
        // Las que se juntaron quedan abajo de la que nace de ellas.
        zIndex: ficha.absorbida ? 0 : ficha.fusion ? 2 : 1,
      }}
    >
      <div
        className={cn(
          "grid h-full w-full place-items-center font-display leading-none",
          chica
            ? "rounded-[6px] shadow-[inset_0_-2px_0_hsl(240_12%_5%/0.1)]"
            : "rounded-[10px] shadow-[inset_0_-3px_0_hsl(240_12%_5%/0.1)] sm:rounded-xl",
          ficha.nueva && "animate-ficha-nueva",
          ficha.fusion && "animate-ficha-fusion"
        )}
        style={{ ...estiloFicha(ficha.valor), fontSize: `${tamañoNumero(ficha.valor)}cqw` }}
      >
        {ficha.valor}
      </div>
    </div>
  );
}
