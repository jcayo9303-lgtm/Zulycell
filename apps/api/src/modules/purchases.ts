import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { badRequest } from "../lib/errors.js";
import { dateStr, id, money, optId, optStr, paymentMethod, qty } from "../lib/validate.js";
import { round2 } from "../lib/money.js";
import { imageUrl } from "../lib/storage.js";
import { moveStock } from "../services/inventory.js";
import { normalizeSerials, registerSerials } from "../services/serials.js";
import { ctx, requirePerm } from "../middleware/auth.js";

const router = Router();
router.use(requirePerm("inventory_edit"));

const listSchema = z.object({
  supplierId: z.string().optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
});

router.get("/", async (req, res) => {
  const { businessId } = ctx(req);
  const { supplierId, from, to } = listSchema.parse(req.query);
  const where: Prisma.PurchaseWhereInput = { businessId };
  if (supplierId) where.supplierId = supplierId;
  if (from || to) {
    where.date = {
      ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
      ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
    };
  }
  const purchases = await prisma.purchase.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { items: true, supplier: { select: { id: true, name: true } } },
  });
  res.json(purchases.map((p) => ({ ...p, invoiceImageUrl: imageUrl(p.invoiceImageKey, 1200) })));
});

const purchaseSchema = z.object({
  supplierId: id,
  items: z
    .array(
      z.object({
        productId: id,
        variantId: optId,
        quantity: qty(0.001, 999_999),
        unitCost: money(0.01),
        /** IMEI de las unidades recibidas (productos con IMEI) */
        serials: z.array(z.string().max(40)).max(2000).default([]),
      }),
    )
    .min(1, "Agrega al menos un producto"),
  method: paymentMethod,
  date: dateStr,
  invoiceRef: optStr(50),
  invoiceImageKey: optStr(300),
  notes: optStr(255),
});

router.post("/", async (req, res) => {
  const { businessId, userId } = ctx(req);
  const data = purchaseSchema.parse(req.body);

  const purchase = await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, businessId, deletedAt: null } });
    if (!supplier) throw badRequest("El proveedor no existe.");

    const products = await tx.product.findMany({
      where: { id: { in: data.items.map((i) => i.productId) }, businessId, deletedAt: null },
      include: { variants: { where: { deletedAt: null } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const lines = data.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw badRequest("Uno de los productos ya no existe.");
      const variant = item.variantId ? product.variants.find((v) => v.id === item.variantId) : null;
      if (item.variantId && !variant) throw badRequest(`La variante de "${product.name}" ya no existe.`);
      const serials = product.serialized ? normalizeSerials(item.serials) : [];
      if (product.serialized && serials.length !== item.quantity) {
        throw badRequest(`Ingresa ${item.quantity} IMEI para "${product.name}" (llevas ${serials.length}).`);
      }
      return {
        productId: product.id,
        variantId: variant?.id ?? null,
        name: variant ? `${product.name} · ${variant.value}` : product.name,
        quantity: item.quantity,
        unitCost: item.unitCost,
        subtotal: round2(item.quantity * item.unitCost),
        serials,
      };
    });
    const allSerials = lines.flatMap((l) => l.serials);
    if (new Set(allSerials).size !== allSerials.length) throw badRequest("Hay un IMEI repetido en la compra.");
    const total = round2(lines.reduce((a, l) => a + l.subtotal, 0));

    const created = await tx.purchase.create({
      data: {
        businessId,
        supplierId: supplier.id,
        total,
        method: data.method,
        date: new Date(`${data.date}T00:00:00Z`),
        invoiceRef: data.invoiceRef ?? null,
        invoiceImageKey: data.invoiceImageKey ?? null,
        notes: data.notes ?? null,
        userId,
        items: { create: lines.map(({ serials: _s, ...line }) => line) },
      },
      include: { items: true },
    });

    for (const line of lines) {
      if (line.serials.length) {
        await registerSerials(tx, {
          businessId,
          productId: line.productId,
          variantId: line.variantId,
          serials: line.serials,
          purchaseId: created.id,
          notes: `Compra a ${supplier.name}`,
        });
      }
      await moveStock(tx, {
        businessId,
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        type: "PURCHASE",
        reason: `Compra a ${supplier.name}`,
        refId: created.id,
        userId,
      });
      // El costo pasa a ser el último costo de compra
      if (line.variantId) {
        await tx.productVariant.update({ where: { id: line.variantId }, data: { cost: line.unitCost } });
      } else {
        await tx.product.update({ where: { id: line.productId }, data: { cost: line.unitCost } });
      }
    }

    if (data.method === "CREDIT") {
      await tx.supplierMovement.create({
        data: {
          businessId,
          supplierId: supplier.id,
          type: "DEBT",
          amount: total,
          description: `Compra a crédito${data.invoiceRef ? ` · ${data.invoiceRef}` : ""}`,
          purchaseId: created.id,
          userId,
        },
      });
    }
    return created;
  });

  res.status(201).json(purchase);
});

export default router;
