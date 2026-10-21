import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { badRequest, notFound } from "../lib/errors.js";
import { imageUrl, isAllowedImage, putImage, signedPrivateUrl } from "../lib/storage.js";
import { ctx } from "../middleware/auth.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const folderSchema = z.object({
  folder: z.enum(["products", "logos", "banners", "expenses", "purchases"]).default("products"),
});

/** POST /uploads?folder=products  (multipart, campo "file") → { key, url } */
router.post("/", upload.single("file"), async (req, res) => {
  const { folder } = folderSchema.parse(req.query);
  const file = req.file;
  if (!file) throw badRequest("Selecciona una imagen.");
  if (!isAllowedImage(file.mimetype)) throw badRequest("Solo se permiten imágenes JPG, PNG o WEBP.");
  const key = await putImage(ctx(req).businessId, folder, file.buffer, file.mimetype);
  res.status(201).json({ key, url: imageUrl(key, 400) });
});

/** GET /uploads/file?key=… → redirige a un enlace firmado si la imagen es del negocio de la sesión */
router.get("/file", async (req, res) => {
  const { key } = z.object({ key: z.string().min(3).max(300) }).parse(req.query);
  if (!key.startsWith(`${ctx(req).businessId}/`) || key.includes("..")) throw notFound();
  res.redirect(302, await signedPrivateUrl(key));
});

export default router;
