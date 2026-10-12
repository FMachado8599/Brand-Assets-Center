"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { findClientByName, rememberClient, useClients } from "@/hooks/useClients";
import { brandsRepo, clientErrorMessage } from "@/lib/repos/brands";
import { PRESET_COLORS } from "@/lib/clients/color";
import { brandColorOf, logoColors } from "@/lib/clients/logo";
import type { Brand } from "@/lib/types";
import { ColorChoice } from "./ColorChoice";
import { LogoDrop } from "./LogoDrop";
import { closeNewClient, type NewClientRequest } from "./newClient";

/**
 * Crear un cliente sin salir de lo que estás haciendo: nombre, color y, si
 * lo tenés a mano, el logo. El resto de la ficha (paleta, tipografías,
 * notas) se completa después en Clientes.
 *
 * Se carga recién la primera vez que alguien lo abre (ver NewClientHost).
 */
export function NewClientDialog({ request }: { request: NewClientRequest | null }) {
  const router = useRouter();
  const pathname = usePathname();
  useClients(); // para que "ya existe" se entere de la lista aunque se abra antes de que cargue
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [colorPicked, setColorPicked] = useState(false);
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fromLogo, setFromLogo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  // Cada vez que se abre, de cero.
  useEffect(() => {
    if (!request) return;
    setName(request.name ?? "");
    setColor(PRESET_COLORS[0]);
    setColorPicked(false);
    setLogo(null);
    setPreview(null);
    setFromLogo([]);
    setBusy(false);
  }, [request]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const existing = name.trim() ? findClientByName(name) : null;
  const inClientes = pathname.startsWith("/clientes");

  const pickLogo = async (file: File) => {
    setLogo(file);
    setPreview(URL.createObjectURL(file));
    const colors = await logoColors(file);
    setFromLogo(colors);
    // El color del cliente sale del logo, salvo que ya hayas elegido uno.
    if (!colorPicked && colors.length) setColor(brandColorOf(colors));
  };

  const finish = (brand: Brand, openProfile: boolean) => {
    request?.onCreated?.(brand);
    closeNewClient();
    if (openProfile) router.push(`/clientes/${brand.id}`);
  };

  const create = async (openProfile = false) => {
    if (!name.trim() || busy || existing) return;
    setBusy(true);
    const { data, error } = await brandsRepo.create(name, color);
    if (error || !data) {
      toast(error ? clientErrorMessage(error) : "No se pudo crear el cliente", "error");
      setBusy(false);
      return;
    }
    let brand = data as Brand;
    if (logo) {
      const up = await brandsRepo.uploadLogo(logo);
      if (up.error) {
        toast(`${brand.name} se creó, pero sin logo: ${clientErrorMessage(up.error)}`, "error");
      } else {
        const saved = await brandsRepo.update(brand.id, { logo_url: up.url, logo_path: up.path });
        if (saved.error) {
          toast(`${brand.name} se creó, pero sin logo: ${clientErrorMessage(saved.error)}`, "error");
          brandsRepo.removeLogoFile(up.path);
        } else brand = saved.data as Brand;
      }
    }
    rememberClient(brand);
    toast(`Cliente ${brand.name} creado`);
    finish(brand, openProfile);
  };

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && !busy && closeNewClient()}>
      <DialogContent
        className="max-w-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          nameInput.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            Aparece al toque en Tarjetas y Redacción. Colores, tipografías y notas se completan en su ficha.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create(false);
          }}
        >
          <div className="flex gap-4">
            <div className="flex shrink-0 flex-col gap-1.5">
              <LogoDrop
                preview={preview}
                onFile={pickLogo}
                busy={busy}
                hint="Logo (opcional)"
                className="h-28 w-28 sm:h-32 sm:w-32"
              >
                {preview && !busy && (
                  <button
                    type="button"
                    aria-label="Sacar el logo"
                    onClick={() => {
                      setLogo(null);
                      setPreview(null);
                      setFromLogo([]);
                    }}
                    className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink/70 text-cream opacity-0 transition-opacity hover:bg-ink group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </LogoDrop>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div>
                <Label htmlFor="nuevo-cliente">Nombre</Label>
                <Input
                  ref={nameInput}
                  id="nuevo-cliente"
                  className="mt-1.5"
                  value={name}
                  maxLength={80}
                  placeholder="Ej: Changan"
                  autoComplete="off"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label>Color</Label>
                <div className="mt-2">
                  <ColorChoice
                    value={color}
                    suggested={fromLogo}
                    onChange={(c) => {
                      setColor(c);
                      setColorPicked(true);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {existing && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-primary/20 px-3 py-2.5 text-sm">
              <span className="flex-1">
                Ya existe <strong className="font-semibold">{existing.name}</strong>.
              </span>
              {request?.onCreated && (
                <Button type="button" size="sm" variant="outline" onClick={() => finish(existing, false)}>
                  Usar ese
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" onClick={() => finish(existing, true)}>
                Ver su ficha <ArrowRight />
              </Button>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            {!inClientes && (
              <Button type="button" variant="outline" disabled={!name.trim() || busy || !!existing} onClick={() => create(true)}>
                Crear y abrir su ficha
              </Button>
            )}
            <Button type="submit" disabled={!name.trim() || busy || !!existing}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? "Creando…" : "Crear cliente"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
