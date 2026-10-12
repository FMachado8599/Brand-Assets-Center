"use client";

import { useSyncExternalStore } from "react";
import type { Brand } from "@/lib/types";

export type NewClientRequest = {
  /** Para arrancar con el nombre ya escrito (ej: lo que se buscó y no estaba). */
  name?: string;
  /** Se llama con el cliente creado (o con el que ya existía, si se eligió usarlo): el selector lo deja elegido. */
  onCreated?: (brand: Brand) => void;
};

/**
 * "Nuevo cliente" se abre desde cualquier lado (los selectores de Tarjetas y
 * Redacción, la sidebar, Clientes) y hay un solo diálogo, en el marco de la
 * app. Esto es el pedido de abrirlo: sin React ni Supabase, así importarlo
 * no le suma peso a ningún módulo.
 */
let request: NewClientRequest | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function openNewClient(req: NewClientRequest = {}) {
  request = req;
  emit();
}

export function closeNewClient() {
  request = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNewClientRequest() {
  return useSyncExternalStore(subscribe, () => request, () => null);
}
