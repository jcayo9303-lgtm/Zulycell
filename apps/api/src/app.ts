import express, { type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger.js";
import { plainJson } from "./lib/serialize.js";
import { errorHandler, forbidden, notFound } from "./lib/errors.js";
import { apiRouter } from "./routes.js";

/** Protección CSRF: las peticiones que modifican datos deben venir del mismo origen. */
const sameOrigin: RequestHandler = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();
  const host = req.get("x-forwarded-host") ?? req.get("host");
  try {
    if (new URL(origin).host === host) return next();
  } catch {
    /* origen inválido */
  }
  throw forbidden("Origen no permitido.");
};

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-origin" } }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(plainJson);
  app.use(sameOrigin);

  app.use("/api", apiRouter);
  app.use(() => {
    throw notFound("Ruta no encontrada.");
  });
  app.use(errorHandler);
  return app;
}
