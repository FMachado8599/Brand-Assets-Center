"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { CampoContrasena, LARGO_MINIMO, pedirAuth } from "@/components/auth/piezas";
import { toast } from "@/components/ui/toaster";

type Estado = { configurado: boolean; tiene: boolean };

/**
 * Tu contraseña: crearla (si entrás con Google y querés poder entrar también con tu mail) o cambiarla
 * (con la actual). Se guarda con Argon2id en el servidor; acá no queda nada.
 */
export function ContrasenaEditor() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pedirAuth<Estado>("estado").then((r) => setEstado(r.error ? { configurado: false, tiene: false } : r));
  }, []);

  if (!estado) return <div className="skeleton h-16 rounded-2xl" />;
  if (!estado.configurado) {
    return <p className="text-sm text-muted-foreground">El ingreso con contraseña todavía no está configurado en este entorno.</p>;
  }

  const limpiar = () => {
    setActual("");
    setNueva("");
    setRepetir("");
    setError(null);
  };

  if (!abierto) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {estado.tiene ? "Tenés contraseña: podés entrar con tu mail desde cualquier computadora." : "Entrás con Google. Si querés, creá una contraseña para entrar también con tu mail."}
        </p>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-[13px] font-medium shadow-sm transition-colors hover:border-foreground/30"
        >
          <KeyRound className="h-4 w-4" /> {estado.tiene ? "Cambiarla" : "Crear contraseña"}
        </button>
      </div>
    );
  }

  const largo = [...nueva.normalize("NFKC")].length;
  const listo = largo >= LARGO_MINIMO && nueva === repetir && (!estado.tiene || actual.length > 0);

  const guardar = async () => {
    setOcupado(true);
    setError(null);
    const r = await pedirAuth<{ ok?: boolean; creada?: boolean }>("cambiar", { actual: estado.tiene ? actual : undefined, nueva });
    setOcupado(false);
    if (!r.ok) {
      setError(r.error ?? "No se pudo guardar");
      return;
    }
    toast(r.creada ? "Contraseña creada" : "Contraseña cambiada");
    limpiar();
    setAbierto(false);
    setEstado({ ...estado, tiene: true });
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (listo && !ocupado) guardar();
      }}
    >
      {estado.tiene && (
        <CampoContrasena label="Contraseña actual" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
      )}
      <CampoContrasena
        label="Contraseña nueva"
        autoComplete="new-password"
        value={nueva}
        maxLength={128}
        onChange={(e) => setNueva(e.target.value)}
        hint={`Al menos ${LARGO_MINIMO} caracteres. Una frase sirve; se revisa que no esté en filtraciones conocidas.`}
      />
      <CampoContrasena label="Repetila" autoComplete="new-password" value={repetir} maxLength={128} onChange={(e) => setRepetir(e.target.value)} />
      {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!listo || ocupado}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {ocupado && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
        </button>
        <button
          type="button"
          onClick={() => {
            limpiar();
            setAbierto(false);
          }}
          className="h-9 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
