"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Ask = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/**
 * Reemplaza al `confirm()` del navegador, que no se puede estilar, bloquea
 * el hilo y en algunos navegadores queda escondido detrás de la pestaña.
 * La API es igual de simple: `await confirm({...})` devuelve true o false.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Dialog open={Boolean(options)} onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{options?.title}</DialogTitle>
            {options?.description && <DialogDescription>{options.description}</DialogDescription>}
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close(false)}>
              {options?.cancelLabel || "Cancelar"}
            </Button>
            <Button variant={options?.destructive ? "destructive" : "default"} onClick={() => close(true)} autoFocus>
              {options?.confirmLabel || "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error("useConfirm tiene que usarse dentro de <ConfirmProvider>");
  return ask;
}
