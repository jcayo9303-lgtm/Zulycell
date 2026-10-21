import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { notFound } from "../lib/errors.js";
import { addDays, todayYmd } from "../lib/dates.js";
import { ctx, requirePerm } from "../middleware/auth.js";
import { productDto, productInclude } from "./products.js";

const router = Router();

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const cleanSerial = (s: string) => s.replace(/\s+/g, "").toUpperCase();

const searchSchema = z.object({ q: z.string().trim().min(2, "Escribe al menos 2 caracteres").max(60) });

/**
 * Búsqueda de garantías: por IMEI / serie, número de venta, o nombre / teléfono del cliente.
 * Devuelve las líneas de venta con su garantía y las órdenes de reparación del equipo.
 */
router.get("/search", requirePerm("sales_view", "repairs_view"), async (req, res) => {
  const { businessId } = ctx(req);
  const { q } = searchSchema.parse(req.query);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });
  const today = todayYmd(business.timezone);
  const serial = cleanSerial(q);
  const isSerialLike = /^[A-Z0-9-]{4,30}$/.test(serial);
  const saleNumber = /^#?\d{1,9}$/.test(q) ? Number(q.replace("#", "")) : null;

  // Series registradas que coinciden (en stock, vendidas o de baja)
  const serialRows = isSerialLike
    ? await prisma.productSerial.findMany({
        where: { businessId, serial: { contains: serial } },
        include: { product: { select: { id: true, name: true, brand: true, warrantyDays: true } } },
        take: 50,
      })
    : [];

  // Ventas que contienen el IMEI, por número o por cliente
  const saleOr: Prisma.SaleWhereInput[] = [];
  if (isSerialLike) saleOr.push({ items: { some: { serials: { has: serial } } } });
  const soldIds = serialRows.map((r) => r.saleId).filter((x): x is string => Boolean(x));
  if (soldIds.length) saleOr.push({ id: { in: soldIds } });
  if (saleNumber) saleOr.push({ number: saleNumber });
  if (!saleNumber) {
    saleOr.push({
      client: {
        OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }],
      },
    });
  }
  const sales = await prisma.sale.findMany({
    where: { businessId, OR: saleOr },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      items: true,
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const items = sales.flatMap((sale) => {
    const matchesSerial = (i: (typeof sale.items)[number]) => isSerialLike && i.serials.some((s) => s.includes(serial));
    // Por IMEI: solo las líneas con ese IMEI. Por nº de venta: todas. Por cliente: las que tienen garantía o IMEI.
    const lines = sale.items.some(matchesSerial)
      ? sale.items.filter(matchesSerial)
      : sale.number === saleNumber
        ? sale.items
        : sale.items.filter((i) => i.serials.length > 0 || i.warrantyUntil !== null);
    return lines.flatMap((line) => {
      const until = ymd(line.warrantyUntil);
      const base = {
        kind: "sale" as const,
        saleId: sale.id,
        saleNumber: sale.number,
        saleDate: sale.createdAt,
        saleStatus: sale.status,
        client: sale.client,
        productId: line.productId,
        productName: line.name,
        warrantyUntil: until,
        inWarranty: sale.status === "COMPLETED" && until !== null ? until >= today : null,
      };
      const onlyMatching = matchesSerial(line);
      const serials: (string | null)[] = line.serials.length
        ? line.serials.filter((s) => !onlyMatching || s.includes(serial))
        : [null];
      return serials.map((s) => ({
          ...base,
          key: `${line.id}:${s ?? ""}`,
          serial: s,
          serialStatus: s ? (serialRows.find((r) => r.serial === s)?.status ?? null) : null,
        }));
    });
  });

  // IMEI registrados que aún no se vendieron (en stock o de baja)
  const stock = serialRows
    .filter((r) => !r.saleId)
    .map((r) => ({
      kind: "stock" as const,
      key: r.id,
      serial: r.serial,
      serialStatus: r.status,
      productId: r.product.id,
      productName: r.product.name,
      brand: r.product.brand,
      createdAt: r.createdAt,
    }));

  const repairs = isSerialLike
    ? await prisma.repairOrder.findMany({
        where: { businessId, imei: { contains: serial } },
        include: { client: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : await prisma.repairOrder.findMany({
        where: {
          businessId,
          OR: [
            ...(saleNumber ? [{ number: saleNumber }] : []),
            { client: { name: { contains: q, mode: "insensitive" as const } } },
            { client: { phone: { contains: q.replace(/\D/g, "") || q } } },
          ],
        },
        include: { client: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

  res.json({
    items,
    stock,
    repairs: repairs.map((r) => {
      const until = r.deliveredAt && r.warrantyDays > 0 ? addDays(todayYmd(business.timezone, r.deliveredAt), r.warrantyDays) : null;
      return {
        id: r.id,
        number: r.number,
        status: r.status,
        deviceType: r.deviceType,
        brand: r.brand,
        model: r.model,
        imei: r.imei,
        client: r.client,
        createdAt: r.createdAt,
        deliveredAt: r.deliveredAt,
        warrantyDays: r.warrantyDays,
        warrantyUntil: until,
        inWarranty: until ? until >= today : null,
      };
    }),
  });
});

/** IMEI exacto → producto, para agregarlo directo en el POS */
router.get("/serial/:serial", requirePerm("sales_create", "sales_view", "repairs_view"), async (req, res) => {
  const { businessId } = ctx(req);
  const row = await prisma.productSerial.findFirst({
    where: { businessId, serial: cleanSerial(String(req.params.serial)) },
  });
  if (!row) throw notFound("No hay ningún equipo registrado con ese IMEI.");
  const product = await prisma.product.findFirst({ where: { id: row.productId, deletedAt: null }, include: productInclude });
  if (!product) throw notFound("El producto de ese IMEI fue eliminado.");
  res.json({ product: productDto(product), variantId: row.variantId, serial: row.serial, status: row.status });
});

export default router;
