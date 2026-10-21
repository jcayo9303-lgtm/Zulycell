/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_INTERNAL_URL || "http://localhost:4000";

const nextConfig = {
  output: process.env.NETLIFY === "true" ? undefined : "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // Sin source maps en producción (la auditoría lo valoró como positivo)
  productionBrowserSourceMaps: false,
  // En Netlify /api va a la función (netlify.toml) y en Docker lo enruta nginx;
  // esta regla sirve para `npm run dev`.
  async rewrites() {
    if (process.env.NETLIFY === "true") return [];
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
