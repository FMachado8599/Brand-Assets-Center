import { Badge } from "@/components/ui/badge";

export function MissingConfig() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 px-6">
      <Badge className="w-fit border-destructive text-destructive">Falta configurar</Badge>
      <h1 className="text-xl font-semibold">Conectá Supabase para empezar</h1>
      <p className="text-sm text-muted-foreground">
        Agregá <code className="rounded bg-secondary px-1">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
        <code className="rounded bg-secondary px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en las variables de entorno y
        volvé a desplegar. Los pasos completos están en el README.
      </p>
    </div>
  );
}
