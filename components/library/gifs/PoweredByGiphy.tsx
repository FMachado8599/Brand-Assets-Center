import { cn } from "@/lib/utils";

/**
 * GIPHY pide que se vea "Powered by GIPHY" donde se usa su API. Si se suma el logo oficial (de su kit de
 * marca), va acá.
 */
export function PoweredByGiphy({ className }: { className?: string }) {
  return (
    <a
      href="https://giphy.com"
      target="_blank"
      rel="noreferrer"
      className={cn("flex items-center gap-1 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground", className)}
    >
      Powered by <span className="font-bold tracking-[0.08em] text-foreground">GIPHY</span>
    </a>
  );
}
