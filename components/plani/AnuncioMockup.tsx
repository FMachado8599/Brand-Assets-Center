"use client";

import { useEffect, useMemo, useState } from "react";
import { logoBackground } from "@/components/clients/ClientMark";
import { PHONE, loadImage, type AvatarSource } from "@/components/ads/draw";
import { MockupView } from "@/components/ads/MockupView";
import { DEFAULT_COLORS, sampleColors, type AdColors } from "@/lib/ads/color";
import { defaultPlacements, placementInfo, type Placement } from "@/lib/ads/placements";
import type { AdMedia } from "@/lib/ads/reel";
import { ctaText } from "@/lib/ads/text";
import { initials } from "@/lib/clients/color";
import { medidaDe } from "@/lib/plani/config";
import { copyTexto } from "@/lib/plani/copy";
import type { Medio, Pieza } from "@/lib/plani/types";
import { cn } from "@/lib/utils";
import { esVideo, useMedioUrl } from "./bits";
import type { MockupBrand } from "./Mockups";

/** El botón por defecto, si Redacción no eligió otro. */
export const CTA_POR_DEFECTO = "Más información";

/** "Changan Uruguay" → "changanuruguay": la cuenta que se ve en el anuncio. */
const cuentaDe = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "");

/** Dónde sale el anuncio: lo que eligió Redacción o lo de siempre según la proporción. */
export function lugaresDe(pieza: Pieza, media: AdMedia | null): Placement[] {
  const elegidos = pieza.anuncio?.lugares?.filter(Boolean) ?? [];
  if (elegidos.length) return elegidos;
  if (media) return defaultPlacements(media);
  return pieza.proporcion === "9:16" ? ["story", "reels"] : ["feed"];
}

/**
 * Una pieza como anuncio, con el mockup de la herramienta de Ads (lo que tapa la interfaz de
 * Instagram en cada lugar). Arriba, los lugares donde sale, para pasar de uno a otro. Lo usan el
 * editor y la presentación (también la del cliente).
 */
export function AnuncioMockup({
  pieza,
  brand,
  ancho = 300,
  onOpen,
  className,
}: {
  pieza: Pieza;
  brand: MockupBrand & { logo_from?: string | null };
  /** El ancho del teléfono en px. */
  ancho?: number;
  onOpen?: (m: Medio) => void;
  className?: string;
}) {
  const medioUrl = useMedioUrl();
  const finales = pieza.medios.filter((m) => m.rol === "final");
  const [slide, setSlide] = useState(0);
  const medio = finales[Math.min(slide, Math.max(0, finales.length - 1))] ?? null;

  // Sin las medidas del archivo (Drive a veces tarda en darlas), las de la pieza.
  const medida = medidaDe(pieza);
  const media: AdMedia | null = useMemo(
    () =>
      medio
        ? { url: medioUrl(medio), kind: esVideo(medio) ? "video" : "image", width: medio.ancho || medida.w, height: medio.alto || medida.h, name: medio.nombre }
        : null,
    [medio, medioUrl, medida.w, medida.h]
  );
  const lugares = lugaresDe(pieza, media);
  const [lugar, setLugar] = useState<Placement>(lugares[0]);
  const actual = lugares.includes(lugar) ? lugar : lugares[0];

  // Los colores de la banda y del botón salen del creativo (como en la herramienta de Ads).
  const [colores, setColores] = useState<AdColors>(DEFAULT_COLORS);
  useEffect(() => {
    if (!media || media.kind !== "image") return setColores(DEFAULT_COLORS);
    let vivo = true;
    loadImage(media.url).then((img) => vivo && img && setColores(sampleColors(img, img.naturalWidth, img.naturalHeight)));
    return () => {
      vivo = false;
    };
  }, [media]);

  // La foto de perfil: el logo del cliente.
  const avatar: AvatarSource = brand.logo_url
    ? brand.logo_from
      ? { url: brand.logo_url }
      : { url: brand.logo_url, background: logoBackground(brand), pad: 0.18 }
    : { letter: initials(brand.name), background: brand.color };
  const [avatarImg, setAvatarImg] = useState<HTMLImageElement | null>(null);
  const avatarUrl = "url" in avatar ? avatar.url : "";
  useEffect(() => {
    let vivo = true;
    if (!avatarUrl) return setAvatarImg(null);
    loadImage(avatarUrl).then((img) => vivo && setAvatarImg(img));
    return () => {
      vivo = false;
    };
  }, [avatarUrl]);

  const feed = placementInfo(actual).kind === "feed";
  const scale = ancho / PHONE.w;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {lugares.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1" role="tablist" aria-label="Dónde sale">
          {lugares.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={l === actual}
              onClick={() => setLugar(l)}
              className={cn(
                "h-7 rounded-full px-2.5 text-[11px] font-semibold transition-colors",
                l === actual ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {placementInfo(l).label}
            </button>
          ))}
        </div>
      )}
      <div className={cn(onOpen && medio && "cursor-zoom-in")} onClick={() => medio && onOpen?.(medio)}>
        <MockupView
          scale={scale}
          placement={actual}
          media={media}
          thumb={null}
          fit={feed ? "cover" : "contain"}
          account={cuentaDe(brand.name)}
          avatar={avatar}
          avatarImg={avatarImg}
          caption={copyTexto(pieza)}
          headline={pieza.anuncio?.titulo || pieza.titulo}
          cta={ctaText(pieza.anuncio?.cta || CTA_POR_DEFECTO, "es")}
          lang="es"
          colors={colores}
          social
          showUI
          mark={false}
          safeZone={false}
          time="9:41"
          card={finales.length > 1 ? { index: slide, total: finales.length } : undefined}
          texts={null}
          textCheck={false}
          nav={
            finales.length > 1
              ? { index: slide, total: finales.length, onPrev: () => setSlide((i) => Math.max(0, i - 1)), onNext: () => setSlide((i) => Math.min(finales.length - 1, i + 1)) }
              : undefined
          }
        />
      </div>
      {!medio && <p className="text-[11px] text-muted-foreground">El diseño todavía no está: se ve cómo va a quedar el anuncio.</p>}
    </div>
  );
}
