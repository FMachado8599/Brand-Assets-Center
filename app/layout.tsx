import type { Metadata, Viewport } from "next";
import { AppFrame } from "@/components/shell/AppFrame";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Herramientas", template: "%s · Herramientas" },
  description: "Tarjetas con tipografía, emojis, GIFs y conversor de archivos.",
};

export const viewport: Viewport = {
  themeColor: "#FFF4C7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
