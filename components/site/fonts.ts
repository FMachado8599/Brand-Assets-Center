import { Instrument_Serif } from "next/font/google";

/** Serif editorial para Inicio y Privacidad. El resto de la app sigue con la tipografía del sistema. */
export const display = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
