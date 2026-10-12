"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

/**
 * La animación de Inicio. Dos momentos, nada más:
 * 1. Al cargar, la barra invertida amarilla (data-intro="cut") corta la portada y la descubre; el título
 *    sube línea por línea y después llegan la línea, el texto y el botón.
 * 2. Al scrollear, el texto marcado con data-read se enciende palabra por palabra mientras se lee.
 * Solo transform y opacity, para que ande liso en placas de video modestas. Con movimiento reducido
 * no corre nada: el corte no se muestra y todo queda quieto.
 */
export function InicioMotion({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const title = q("[data-intro='title']")[0] as HTMLElement | undefined;
        let split: SplitText | undefined;
        let cancelled = false;

        gsap.set(q("[data-intro='label'], [data-intro='fade']"), { autoAlpha: 0, y: 14 });
        gsap.set(q("[data-intro='rule']"), { scaleX: 0 });
        gsap.set(q("[data-intro='light']"), { autoAlpha: 0 });
        gsap.set(title ?? [], { autoAlpha: 0 });

        const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
        tl.to(q("[data-intro='cut']"), { xPercent: 100, duration: 1.2, ease: "expo.inOut" }, 0.15)
          .to(q("[data-intro='light']"), { autoAlpha: 1, duration: 2.4, ease: "power1.out" }, 0.6)
          .to(q("[data-intro='label']"), { autoAlpha: 1, y: 0, duration: 0.9 }, 0.6)
          .to(q("[data-intro='rule']"), { scaleX: 1, duration: 1.3, ease: "expo.inOut" }, 1)
          .to(q("[data-intro='fade']"), { autoAlpha: 1, y: 0, duration: 1, stagger: 0.12 }, 1.3);

        // El título se parte en líneas cuando la serif ya cargó: antes, los cortes de línea salen mal.
        // Al terminar se deshace el split, así el título se reacomoda solo si cambia el ancho.
        // Si el componente se desmontó mientras tanto (o React lo montó dos veces en desarrollo), no se parte.
        if (title) {
          document.fonts.ready.then(() => {
            if (cancelled) return;
            split = SplitText.create(title, { type: "lines", mask: "lines" });
            gsap.set(title, { autoAlpha: 1 });
            tl.from(
              split.lines,
              { yPercent: 110, duration: 1.3, stagger: 0.1, onComplete: () => split?.revert() },
              Math.max(tl.time(), 0.55),
            );
          });
        }

        q("[data-read]").forEach((el) => {
          const words = SplitText.create(el, { type: "words" }).words;
          gsap.from(words, {
            opacity: 0.15,
            ease: "none",
            stagger: 0.1,
            scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 55%", scrub: 0.6 },
          });
        });

        return () => {
          cancelled = true;
          split?.revert();
        };
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(q("[data-intro='cut']"), { autoAlpha: 0 });
      });
    },
    { scope: root },
  );

  return <div ref={root}>{children}</div>;
}
