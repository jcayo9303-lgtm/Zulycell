import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zulycell",
    short_name: "Zulycell",
    description: "Punto de venta, inventario, servicio técnico y caja para tu tienda de celulares.",
    start_url: "/balance",
    scope: "/",
    display: "standalone",
    theme_color: "#d9432b",
    background_color: "#fbf7f2",
    icons: [
      { src: "/logo-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/logo-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
