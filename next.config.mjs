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
    // Argon2id (las contraseñas) es un binario nativo: se carga tal cual en el servidor, sin empaquetar.
    // El correo (IMAP, SMTP y el lector de mails) usa módulos de Node que no conviene empaquetar.
    serverComponentsExternalPackages: ["@node-rs/argon2", "imapflow", "mailparser", "nodemailer"],
    // La búsqueda de emojis lee el índice con fs: hay que decirle a Next que lo incluya en la función.
    outputFileTracingIncludes: {
      "/api/emojis/search": ["./data/emojis/embeddings.json"],
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Los links viejos siguen andando: Emojis pasó a ser una de las librerías (con ?c=categoría) y
  // Planificación, Presentaciones.
  async redirects() {
    return [
      { source: "/emojis", destination: "/library/emojis", permanent: false },
      // Planificación pasó a ser Presentaciones (la plani es uno de sus tipos).
      { source: "/planificacion", destination: "/presentaciones", permanent: false },
      { source: "/planificacion/:id/presentacion", destination: "/presentaciones/:id/presentar", permanent: false },
      { source: "/planificacion/:path*", destination: "/presentaciones/:path*", permanent: false },
    ];
  },
};
export default nextConfig;
