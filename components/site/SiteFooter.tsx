import Link from "next/link";
import { STUDIO } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="bg-ink text-cream">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 border-t border-cream/15 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="site-label text-cream/55">
          {STUDIO} <span className="text-primary">\</span> Herramientas
        </p>
        <nav aria-label="Pie de página" className="flex items-center gap-6">
          <Link href="/" className="site-label text-cream/55 transition-colors hover:text-cream">
            Inicio
          </Link>
          <Link href="/privacidad" className="site-label text-cream/55 transition-colors hover:text-cream">
            Privacidad
          </Link>
          <span className="site-label text-cream/35">© {new Date().getFullYear()}</span>
        </nav>
      </div>
    </footer>
  );
}
