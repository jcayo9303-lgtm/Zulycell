import serverless from "serverless-http";
import { createApp } from "./app.js";

// Entrada de la API en Netlify Functions. netlify.toml reescribe /api/* hacia esta función.
const app = createApp();

type LambdaRequest = { url?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };

export const handler = serverless(app, {
  // Excel, imágenes y PDF se devuelven en base64
  binary: ["application/vnd.openxmlformats-officedocument.*", "application/octet-stream", "image/*", "application/pdf"],
  request(req: LambdaRequest) {
    // Según cómo llegue la reescritura, la ruta puede venir con el prefijo de la función
    if (req.url?.startsWith("/.netlify/functions/api")) {
      req.url = `/api${req.url.slice("/.netlify/functions/api".length)}`;
    }
    // serverless-http entrega el cuerpo ya leído (Buffer) y marca la petición como completa,
    // así que express.json() la omite: se parsea aquí. Multipart (imágenes) lo sigue leyendo multer.
    const type = String(req.headers["content-type"] ?? "");
    if (Buffer.isBuffer(req.body) && type.includes("application/json")) {
      const text = req.body.toString("utf8");
      req.body = text ? JSON.parse(text) : {};
    }
  },
});
