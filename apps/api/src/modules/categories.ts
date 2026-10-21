import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { notFound } from "../lib/errors.js";
import { reqStr } from "../lib/validate.js";
import { ctx, requirePerm } from "../middleware/auth.js";

const router = Router();

const bodySchema = z.object({ name: reqStr(60) });

router.get("/", requirePerm("inventory_view", "inventory_edit", "sales_create"), async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { businessId: ctx(req).businessId },
    orderBy: { name: "asc" },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });
  res.json(categories.map((c) => ({ id: c.id, name: c.name, productCount: c._count.products })));
});

router.post("/", requirePerm("inventory_edit"), async (req, res) => {
  const { name } = bodySchema.parse(req.body);
  const category = await prisma.category.create({ data: { businessId: ctx(req).businessId, name } });
  res.status(201).json(category);
});

router.put("/:id", requirePerm("inventory_edit"), async (req, res) => {
  const { name } = bodySchema.parse(req.body);
  const { count } = await prisma.category.updateMany({
    where: { id: String(req.params.id), businessId: ctx(req).businessId },
    data: { name },
  });
  if (!count) throw notFound();
  res.json({ ok: true });
});

router.delete("/:id", requirePerm("inventory_edit"), async (req, res) => {
  const { count } = await prisma.category.deleteMany({ where: { id: String(req.params.id), businessId: ctx(req).businessId } });
  if (!count) throw notFound();
  res.json({ ok: true });
});

export default router;
