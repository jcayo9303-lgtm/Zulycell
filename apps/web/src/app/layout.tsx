import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "@/styles/globals.css";

// Inter: todo el sistema. JetBrains Mono: solo códigos técnicos.
// Archivos variables (subconjunto latino) descargados de Google Fonts y servidos desde el mismo
// origen: el build no depende de la red y no bloquean el render (auditoría §11).
const inter = localFont({
  src: "../fonts/inter-latin.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});
const jetbrains = localFont({
  src: "../fonts/jetbrains-mono-latin.woff2",
  weight: "100 800",
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Zulycell", template: "%s · Zulycell" },
  description: "Punto de venta, inventario y cuentas para tu negocio.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.png", apple: "/logo-icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#d9432b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Leer la cabecera hace la página dinámica, necesario para el nonce de la CSP.
  headers().get("x-nonce");
  return (
    <html lang="es" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
