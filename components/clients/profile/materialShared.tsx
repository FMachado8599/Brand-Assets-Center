"use client";

import { FileText, Image as ImageIcon, Presentation, Shapes, type LucideIcon } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { formatWords, isImage } from "@/lib/clients/material";
import { materialsRepo } from "@/lib/repos/materials";
import type { BrandMaterial, MaterialKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export const KIND_ICON: Record<MaterialKind, LucideIcon> = {
  documento: FileText,
  presentacion: Presentation,
  logo: Shapes,
  asset: ImageIcon,
};

/** Fondo de ajedrez para ver bien los logos con transparencia. */
const CHECKER =
  "bg-[repeating-conic-gradient(hsl(var(--secondary))_0_25%,transparent_0_50%)] bg-[length:12px_12px]";

export type AiInfo = {
  /** `on`: la IA lo lee. `off`: se dejó afuera a propósito. `none`: no hay nada que leer. */
  tone: "on" | "off" | "none";
  label: string;
  /** Tiene texto o nota: solo entonces tiene sentido el interruptor. */
  canToggle: boolean;
};

/** Qué sabe la IA de este archivo, dicho en una frase corta (se muestra con ícono, no solo con color). */
export function aiInfo(item: BrandMaterial): AiInfo {
  const hasText = item.text_chars > 0;
  const hasNote = item.note.trim().length > 0;
  if (!hasText && !hasNote) {
    return {
      tone: "none",
      canToggle: false,
      label: isImage(item) ? "Sin texto: sumale una nota para la IA" : "Sin texto para leer",
    };
  }
  if (!item.use_ai) return { tone: "off", canToggle: true, label: "La IA no lo usa" };
  const label = hasText
    ? `La IA lee ${formatWords(item.text_chars)}${hasNote ? " y la nota" : ""}`
    : "La IA lee la nota";
  return { tone: "on", canToggle: true, label };
}

/** Abre el archivo en otra pestaña o lo baja. El link se firma al momento: el almacenamiento es privado. */
export async function openMaterial(item: Pick<BrandMaterial, "file_path" | "file_name">, download = false) {
  // La pestaña se abre antes de esperar el link: si no, el navegador la bloquea como emergente.
  const tab = download ? null : window.open("", "_blank");
  if (tab) tab.opener = null;
  const url = await materialsRepo.signedUrl(item.file_path, download ? item.file_name : undefined);
  if (!url) {
    tab?.close();
    toast("No pude abrir el archivo", "error");
    return;
  }
  if (tab) {
    tab.location.href = url;
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = item.file_name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Miniatura: la imagen si es una imagen, y si no el ícono de su tipo. */
export function Thumb({
  item,
  url,
  className,
  iconClass = "h-5 w-5",
}: {
  item: Pick<BrandMaterial, "kind" | "file_name" | "mime">;
  url?: string;
  className?: string;
  iconClass?: string;
}) {
  const Icon = KIND_ICON[item.kind];
  const showImage = Boolean(url) && isImage(item);
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-xl",
        showImage ? CHECKER : "bg-secondary text-muted-foreground",
        className
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
      ) : (
        <Icon className={iconClass} />
      )}
    </span>
  );
}
