// Cabeceras de seguridad para todas las rutas (los "cinturones" del navegador).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Otra carpeta de compilación para correr un segundo server en paralelo (ej: NEXT_DIST_DIR=.next-dev) sin pisar el primero.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // La búsqueda de emojis lee el índice con fs: hay que decirle a Next que lo incluya en la función.
    outputFileTracingIncludes: {
      "/api/emojis/search": ["./data/emojis/embeddings.json"],
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
