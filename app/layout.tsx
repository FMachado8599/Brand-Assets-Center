import type { Metadata, Viewport } from "next";
import { AppFrame } from "@/components/shell/AppFrame";
import { display } from "@/components/site/fonts";
import { MODO_NOCHE_SCRIPT } from "@/lib/tema";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Herramientas", template: "%s · Herramientas" },
  description: "Tarjetas con tipografía, emojis, GIFs y conversor de archivos.",
};

export const viewport: Viewport = {
  themeColor: "#ebe7dd",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: el script del <head> le pone la clase del modo noche antes de que llegue React.
    <html lang="es" className={display.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODO_NOCHE_SCRIPT }} />
      </head>
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
