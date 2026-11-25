import type { Dir } from "@/lib/rest/teclado";

/** El cuerpo es un poco más angosto que la celda: queda este margen de cada lado. */
const MARGEN = 0.14;
const RADIO = 0.24;

type Punto = { x: number; y: number };

/** Dónde van los ojos, según para dónde mira (en fracciones de la celda). */
const OJOS: Record<Dir, [Punto, Punto]> = {
  derecha: [{ x: 0.62, y: 0.33 }, { x: 0.62, y: 0.67 }],
  izquierda: [{ x: 0.38, y: 0.33 }, { x: 0.38, y: 0.67 }],
  arriba: [{ x: 0.33, y: 0.38 }, { x: 0.67, y: 0.38 }],
  abajo: [{ x: 0.33, y: 0.62 }, { x: 0.67, y: 0.62 }],
};

/**
 * La víbora en SVG, en unidades de celda: un tramo redondeado entre cada par de celdas seguidas
 * (así las curvas quedan redondeadas por fuera) y la cabeza con los ojos. Se pinta con el color
 * del texto: tinta de día, crema de noche.
 */
export function CuerpoVibora({ celdas, dir, chocada }: { celdas: Punto[]; dir: Dir; chocada?: boolean }) {
  const cabeza = celdas[0];
  const ancho = 1 - 2 * MARGEN;
  return (
    <g className="fill-foreground">
      {celdas.slice(0, -1).map((a, k) => {
        const b = celdas[k + 1];
        return (
          <rect
            key={k}
            x={Math.min(a.x, b.x) + MARGEN}
            y={Math.min(a.y, b.y) + MARGEN}
            width={Math.abs(a.x - b.x) + ancho}
            height={Math.abs(a.y - b.y) + ancho}
            rx={RADIO}
          />
        );
      })}
      <rect
        x={cabeza.x + MARGEN}
        y={cabeza.y + MARGEN}
        width={ancho}
        height={ancho}
        rx={RADIO}
        className={chocada ? "fill-destructive" : undefined}
      />
      {OJOS[dir].map((o, k) => (
        <circle key={k} cx={cabeza.x + o.x} cy={cabeza.y + o.y} r={0.09} className="fill-card" />
      ))}
    </g>
  );
}

/** La fruta: amarilla, con su cabito. Aparece creciendo (con un key nuevo por cada fruta). */
export function Fruta({ x, y }: Punto) {
  return (
    <g className="duration-300 animate-in zoom-in-0" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
      <circle cx={x + 0.5} cy={y + 0.56} r={0.3} className="fill-primary stroke-foreground" strokeWidth={0.07} />
      <path
        d={`M${x + 0.5} ${y + 0.27} q0.04 -0.13 0.17 -0.17`}
        className="fill-none stroke-foreground"
        strokeWidth={0.07}
        strokeLinecap="round"
      />
    </g>
  );
}
