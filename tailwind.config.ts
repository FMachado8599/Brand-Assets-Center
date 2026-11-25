import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem" },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        // Inicio y Privacidad: la paleta editorial (negro tinta y crema).
        ink: "#0b0b0e",
        cream: "#ebe7dd",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        ui: ["ui-sans-serif", "-apple-system", "Segoe UI", "Inter", "sans-serif"],
        // Se carga solo en Inicio y Privacidad (components/site/fonts.ts).
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      // Con nombre, sirve para transiciones y animaciones: como valor arbitrario (ease-[cubic-bezier(…)])
      // Tailwind lo considera ambiguo con tailwindcss-animate y no genera nada.
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        // Fusión (Rest): la ficha nueva aparece creciendo y la que nace de juntar dos da un saltito.
        "ficha-nueva": { from: { transform: "scale(0)", opacity: "0" }, to: { transform: "scale(1)", opacity: "1" } },
        "ficha-fusion": {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "55%": { transform: "scale(1.12)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        // Empiezan cuando termina el deslizamiento (100 ms); hasta entonces no se ven.
        "ficha-nueva": "ficha-nueva 180ms ease-out 100ms backwards",
        "ficha-fusion": "ficha-fusion 200ms ease-out 90ms backwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
