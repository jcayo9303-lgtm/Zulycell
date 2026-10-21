import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { logger } from "./logger.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, message, "BAD_REQUEST", fields);
export const unauthorized = (message = "Tu sesión expiró. Vuelve a iniciar sesión.") =>
  new HttpError(401, message, "UNAUTHORIZED");
export const forbidden = (message = "No tienes permiso para realizar esta acción.") =>
  new HttpError(403, message, "FORBIDDEN");
export const notFound = (message = "No encontramos lo que buscas.") =>
  new HttpError(404, message, "NOT_FOUND");
export const conflict = (message: string) => new HttpError(409, message, "CONFLICT");
export const tooMany = (message = "Llegaste al límite de intentos. Espera unos minutos.") =>
  new HttpError(429, message, "TOO_MANY_REQUESTS");

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join(".")] ??= issue.message;
    res.status(400).json({ error: "Revisa los datos ingresados.", code: "VALIDATION", fields });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, fields: err.fields });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "Ya existe un registro con esos datos.", code: "DUPLICATE" });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: "No encontramos lo que buscas.", code: "NOT_FOUND" });
      return;
    }
  }
  if (err?.type === "entity.too.large" || err?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "El archivo es demasiado grande (máximo 5 MB).", code: "TOO_LARGE" });
    return;
  }
  (req.log ?? logger).error({ err, url: req.originalUrl }, "Error no controlado");
  res.status(500).json({ error: "Discúlpanos, tenemos problemas técnicos.", code: "INTERNAL" });
};
