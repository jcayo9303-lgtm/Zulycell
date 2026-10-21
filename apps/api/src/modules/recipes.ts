import { Router } from "express";
import { z } from "zod";
import { prisma, Prisma, type Tx } from "../lib/prisma.js";
import { badRequest, notFound } from "../lib/errors.js";
import { id, money, optId, optStr, qty, reqStr, unit } from "../lib/validate.js";
import { round2 } from "../lib/money.js";
import { imageUrl } from "../lib/storage.js";
import { convertUnit } from "../services/inventory.js";
import { ctx, requirePerm } from "../middleware/auth.js";
import { marginOf } from "./products.js";

// Recetas (docs §16, plan Pro): productos con isRecipe=true que descuentan insumos al venderse.

const router = Router();
router.use(requirePerm("inventory_edit"));

const recipeInclude = {
  category: { select: { name: true } },
  ingredients: { include: { ingredient: { select: { id: true, name: true, unit: true, cost: true, deletedAt: true } } } },
} satisfies Prisma.ProductInclude;

type RecipeRow = Prisma.ProductGetPayload<{ include: typeof recipeInclude }>;

function recipeDto(r: RecipeRow) {
  const ingredients = r.ingredients.map((ing) => {
    const quantity = ing.quantity.toNumber();
    const lineCost = convertUnit(quantity, ing.unit, ing.ingredient.unit) * ing.ingredient.cost.toNumber();
    return {
      ingredientId: ing.ingredientId,
      name: ing.ingredient.name,
      quantity,
      unit: ing.unit,
      ingredientUnit: ing.ingredient.unit,
      ingredientCost: ing.ingredient.cost.toNumber(),
      lineCost: round2(lineCost),
      deleted: Boolean(ing.ingredient.deletedAt),
    };
  });
  const cost = round2(ingredients.reduce((acc, i) => acc + i.lineCost, 0));
  const price = r.price.toNumber();
  return {
    id: r.id,
    name: r.name,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    imageKey: r.imageKey,
    imageUrl: imageUrl(r.imageKey, 400),
    description: r.description,
    visibleInCatalog: r.visibleInCatalog,
    price,
    cost,
    margin: marginOf(price, cost),
    ingredients,
  };
}

const threeDecimals = (n: number) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6;

const recipeSchema = z.object({
  name: reqStr(100),
  categoryId: optId,
  ingredients: z
    .array(
      z.object({
        ingredientId: id,
        quantity: qty(0.001, 9999).refine(threeDecimals, "Máximo 3 decimales"),
        unit,
      }),
    )
    .min(1, "Agrega al menos un ingrediente"),
  price: money(0.01),
  imageKey: optStr(300),
  description: optStr(500),
  visibleInCatalog: z.boolean().default(true),
});

type RecipeInput = z.infer<typeof recipeSchema>;

/** Valida insumos y unidades; devuelve el costo calculado de la receta. */
async function validate(tx: Tx, businessId: string, data: RecipeInput, selfId?: string): Promise<number> {
  const ids = data.ingredients.map((i) => i.ingredientId);
  if (new Set(ids).size !== ids.length) throw badRequest("Hay ingredientes repetidos.");
  if (selfId && ids.includes(selfId)) throw badRequest("Una receta no puede usarse a sí misma.");
  if (data.categoryId && !(await tx.category.findFirst({ where: { id: data.categoryId, businessId } }))) {
    throw badRequest("La categoría no existe.");
  }
  const products = await tx.product.findMany({
    where: { id: { in: ids }, businessId, deletedAt: null, isRecipe: false },
    select: { id: true, name: true, unit: true, cost: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  let cost = 0;
  for (const ing of data.ingredients) {
    const p = byId.get(ing.ingredientId);
    if (!p) throw badRequest("Uno de los ingredientes no existe en el inventario.");
    let converted: number;
    try {
      converted = convertUnit(ing.quantity, ing.unit, p.unit);
    } catch {
      throw badRequest(`La unidad elegida no es compatible con "${p.name}".`);
    }
    cost += converted * p.cost.toNumber();
  }
  return round2(cost);
}

const findRecipe = (businessId: string, recipeId: string) =>
  prisma.product.findFirst({ where: { id: recipeId, businessId, isRecipe: true, deletedAt: null }, include: recipeInclude });

router.get("/", async (req, res) => {
  const rows = await prisma.product.findMany({
    where: { businessId: ctx(req).businessId, isRecipe: true, deletedAt: null },
    include: recipeInclude,
    orderBy: { name: "asc" },
  });
  res.json(rows.map(recipeDto));
});

router.get("/:id", async (req, res) => {
  const recipe = await findRecipe(ctx(req).businessId, String(req.params.id));
  if (!recipe) throw notFound("La receta no existe.");
  res.json(recipeDto(recipe));
});

router.post("/", async (req, res) => {
  const { businessId } = ctx(req);
  const data = recipeSchema.parse(req.body);
  const created = await prisma.$transaction(async (tx) => {
    const cost = await validate(tx, businessId, data);
    return tx.product.create({
      data: {
        businessId,
        name: data.name,
        categoryId: data.categoryId ?? null,
        imageKey: data.imageKey ?? null,
        description: data.description ?? null,
        visibleInCatalog: data.visibleInCatalog,
        price: data.price,
        cost,
        isRecipe: true,
        trackStock: false,
        ingredients: { create: data.ingredients },
      },
    });
  });
  res.status(201).json(recipeDto((await findRecipe(businessId, created.id))!));
});

router.put("/:id", async (req, res) => {
  const { businessId } = ctx(req);
  const recipeId = String(req.params.id);
  const data = recipeSchema.parse(req.body);
  await prisma.$transaction(async (tx) => {
    const current = await tx.product.findFirst({ where: { id: recipeId, businessId, isRecipe: true, deletedAt: null } });
    if (!current) throw notFound("La receta no existe.");
    const cost = await validate(tx, businessId, data, recipeId);
    await tx.recipeIngredient.deleteMany({ where: { recipeId } });
    await tx.product.update({
      where: { id: recipeId },
      data: {
        name: data.name,
        categoryId: data.categoryId ?? null,
        imageKey: data.imageKey ?? null,
        description: data.description ?? null,
        visibleInCatalog: data.visibleInCatalog,
        price: data.price,
        cost,
        ingredients: { create: data.ingredients },
      },
    });
  });
  res.json(recipeDto((await findRecipe(businessId, recipeId))!));
});

router.delete("/:id", async (req, res) => {
  const { count } = await prisma.product.updateMany({
    where: { id: String(req.params.id), businessId: ctx(req).businessId, isRecipe: true, deletedAt: null },
    data: { deletedAt: new Date(), visibleInCatalog: false },
  });
  if (!count) throw notFound("La receta no existe.");
  res.json({ ok: true });
});

export default router;
