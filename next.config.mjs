/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // La búsqueda de emojis lee el índice con fs: hay que decirle a Next que lo incluya en la función.
    outputFileTracingIncludes: {
      "/api/emojis/search": ["./data/emojis/embeddings.json"],
    },
  },
};
export default nextConfig;
