import type { Metadata, Viewport } from "next";
import { AppFrame } from "@/components/shell/AppFrame";
import { display } from "@/components/site/fonts";
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
    <html lang="es" className={display.variable}>
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
