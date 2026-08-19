"use client";

import { useState } from "react";
import { cardsRepo } from "@/lib/repos";
import { useData } from "@/components/data/DataProvider";
import { useAction } from "@/hooks/useAction";
import { useConfirm } from "@/components/ui/confirm";
import type { Card } from "@/lib/types";

/**
 * Qué tarjeta está en edición y el borrado. El guardado vive en
 * CardDialog: es el único que conoce el draft mientras se escribe.
 */
export function useCardActions() {
  const { reload } = useData();
  const { run } = useAction();
  const confirm = useConfirm();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (card: Card) => {
    setEditing(card);
    setEditorOpen(true);
  };

  const remove = async (id: string) => {
    const sure = await confirm({
      title: "¿Eliminar esta tarjeta?",
      description: "No se puede deshacer.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!sure) return;
    const ok = await run(async () => {
      const { error } = await cardsRepo.remove(id);
      if (error) throw error;
    }, "Tarjeta eliminada");
    if (ok) await reload();
  };

  return { editorOpen, setEditorOpen, editing, openNew, openEdit, remove };
}
