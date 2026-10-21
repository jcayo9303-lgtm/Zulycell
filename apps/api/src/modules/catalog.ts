import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { notFound } from "../lib/errors.js";
import { optPhone, optStr } from "../lib/validate.js";
import { imageUrl } from "../lib/storage.js";
import { countryByCode } from "../lib/countries.js";
import { ctx, requirePerm } from "../middleware/auth.js";

// Catálogo virtual / tienda online (docs §8 y §18)

const router = Router();
router.use(requirePerm("inventory_edit"));

export const publicCatalogRouter = Router();

const catalogUrl = (slug: string) => `${config.publicUrl}/c/${slug}`;

router.get("/", async (req, res) => {
  const businessId = ctx(req).businessId;
  const [business, products] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
    prisma.product.findMany({
      where: { businessId, deletedAt: null },
      include: { category: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  res.json({
    name: business.name,
    slug: business.slug,
    url: catalogUrl(business.slug),
    catalogEnabled: business.catalogEnabled,
    catalogColor: business.catalogColor,
    catalogDescription: business.catalogDescription,
    catalogWhatsapp: business.catalogWhatsapp,
    logoKey: business.logoKey,
    logoUrl: imageUrl(business.logoKey, 160),
    catalogBannerKey: business.catalogBannerKey,
    bannerUrl: imageUrl(business.catalogBannerKey, 1200),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      imageUrl: imageUrl(p.imageKey, 160),
      categoryName: p.category?.name ?? null,
      isRecipe: p.isRecipe,
      stock: p.stock,
      trackStock: p.trackStock,
      visibleInCatalog: p.visibleInCatalog,
    })),
  });
});

const configSchema = z.object({
  catalogEnabled: z.boolean().optional(),
  catalogColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color HEX inválido (ej. #0F766E)")
    .optional(),
  catalogDescription: optStr(500),
  catalogWhatsapp: optPhone,
  logoKey: optStr(300),
  catalogBannerKey: optStr(300),
});

router.put("/", async (req, res) => {
  const data = configSchema.parse(req.body);
  await prisma.business.update({ where: { id: ctx(req).businessId }, data });
  res.json({ ok: true });
});

router.patch("/products/:id", async (req, res) => {
  const { visibleInCatalog } = z.object({ visibleInCatalog: z.boolean() }).parse(req.body);
  const { count } = await prisma.product.updateMany({
    where: { id: String(req.params.id), businessId: ctx(req).businessId, deletedAt: null },
    data: { visibleInCatalog },
  });
  if (!count) throw notFound("El producto no existe.");
  res.json({ ok: true });
});

publicCatalogRouter.get("/:slug", async (req, res) => {
  const business = await prisma.business.findUnique({ where: { slug: String(req.params.slug) } });
  if (!business || !business.catalogEnabled) throw notFound("Este catálogo no existe o no está disponible.");
  const products = await prisma.product.findMany({
    where: { businessId: business.id, deletedAt: null, visibleInCatalog: true },
    include: { category: { select: { id: true, name: true } }, variants: { where: { deletedAt: null } } },
    orderBy: { name: "asc" },
  });
  const country = countryByCode(business.country);
  const categories = new Map<string, string>();
  for (const p of products) if (p.category) categories.set(p.category.id, p.category.name);

  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({
    business: {
      name: business.name,
      logoUrl: imageUrl(business.logoKey, 160),
      bannerUrl: imageUrl(business.catalogBannerKey, 1200),
      color: business.catalogColor,
      description: business.catalogDescription,
      whatsapp: business.catalogWhatsapp ?? business.phone,
      currency: business.currency,
      currencySymbol: country?.symbol ?? business.currency,
    },
    categories: [...categories].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      categoryId: p.categoryId,
      imageUrl: imageUrl(p.imageKey, 400),
      price: p.price,
      unit: p.unit,
      available: !p.trackStock || p.isRecipe || p.stock.gt(0),
      variants: p.variants.map((v) => ({
        id: v.id,
        type: v.type,
        value: v.value,
        price: v.price ?? p.price,
        available: !p.trackStock || v.stock.gt(0),
      })),
    })),
  });
});

export default router;
