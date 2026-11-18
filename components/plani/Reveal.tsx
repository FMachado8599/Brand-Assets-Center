"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, SplitText);

/**
 * El título grande de Planificación entra como el de Inicio: sube línea por línea desde atrás de
 * una máscara. Es el único movimiento de la pantalla (nada de fade-ups en todo). Se parte cuando la
 * serif ya cargó y se deshace al terminar; con movimiento reducido no se anima.
 */
export function RevealTitle({
  as: Tag = "h1",
  children,
  className,
  delay = 0.1,
  deps = [],
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Cuando cambian (ej: el mes), vuelve a entrar. */
  deps?: unknown[];
}) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      // En una pestaña de fondo el navegador frena los cuadros y el título quedaría a medio entrar.
      if (!el || document.visibilityState === "hidden") return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        let split: SplitText | undefined;
        let cancelled = false;
        gsap.set(el, { autoAlpha: 0 });
        document.fonts.ready.then(() => {
          if (cancelled) return;
          split = SplitText.create(el, { type: "lines", mask: "lines" });
          gsap.set(el, { autoAlpha: 1 });
          gsap.from(split.lines, {
            yPercent: 105,
            duration: 1.1,
            ease: "expo.out",
            stagger: 0.08,
            delay,
            onComplete: () => split?.revert(),
          });
        });
        return () => {
          cancelled = true;
          split?.revert();
          gsap.set(el, { clearProps: "opacity,visibility" });
        };
      });
    },
    { scope: ref, dependencies: deps, revertOnUpdate: true }
  );

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
