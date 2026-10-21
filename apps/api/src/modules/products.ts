import { Router } from "express";
import { Readable } from "node:stream";
import multer from "multer";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma, Prisma, type Tx } from "../lib/prisma.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { barcode, listQuery, money, optId, optStr, qty, reqStr, unit } from "../lib/validate.js";
import { round2 } from "../lib/money.js";
import { imageUrl } from "../lib/storage.js";
import { moveStock } from "../services/inventory.js";
import { normalizeSerials, registerSerials } from "../services/serials.js";
import { sendXlsx } from "../lib/xlsx.js";
import { ctx, requirePerm } from "../middleware/auth.js";

const router = Router();

const canRead = requirePerm("inventory_view", "inventory_edit", "sales_create");
const canEdit = requirePerm("inventory_edit");

export const productInclude = {
  category: { select: { name: true } },
  variants: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export function marginOf(price: number, cost: number): number | null {
  return cost > 0 ? Math.round(((price - cost) / cost) * 1000) / 10 : null;
}

export function productDto(p: ProductRow) {
  const price = p.price.toNumber();
  const cost = p.cost.toNumber();
  return {
    id: p.id,
    name: p.name,
    barcode: p.barcode,
    brand: p.brand,
    compatibleWith: p.compatibleWith,
    warrantyDays: p.warrantyDays,
    serialized: p.serialized,
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? null,
    imageUrl: imageUrl(p.imageKey, 400),
    imageKey: p.imageKey,
    description: p.description,
    price,
    cost,
    margin: marginOf(price, cost),
    stock: p.stock.toNumber(),
    lowStockAlert: p.lowStockAlert.toNumber(),
    unit: p.unit,
    trackStock: p.trackStock,
    isRecipe: p.isRecipe,
    visibleInCatalog: p.visibleInCatalog,
    variants: p.variants.map((v) => ({
      id: v.id,
      type: v.type,
      value: v.value,
      price: v.price?.toNumber() ?? null,
      cost: v.cost?.toNumber() ?? null,
      stock: v.stock.toNumber(),
      barcode: v.barcode,
    })),
  };
}

// ── Listado y consulta ───────────────────────────────────────────────

const listSchema = listQuery.extend({
  categoryId: z.string().max(40).optional(),
  lowStock: z.enum(["true", "false"]).optional(),
  includeRecipes: z.enum(["true", "false"]).optional(),
  brand: z.string().trim().max(60).optional(),
});

router.get("/", canRead, async (req, res) => {
  const { q, page, pageSize, categoryId, lowStock, includeRecipes, brand } = listSchema.parse(req.query);
  const where: Prisma.ProductWhereInput = { businessId: ctx(req).businessId, deletedAt: null };
  if (includeRecipes === "false") where.isRecipe = false;
  if (categoryId) where.categoryId = categoryId;
  if (brand) where.brand = { equals: brand, mode: "insensitive" };
  if (lowStock === "true") {
    where.trackStock = true;
    where.stock = { lte: prisma.product.fields.lowStockAlert };
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { barcode: q },
      { brand: { contains: q, mode: "insensitive" } },
      { compatibleWith: { contains: q, mode: "insensitive" } },
      { variants: { some: { barcode: q, deletedAt: null } } },
      { serials: { some: { serial: q.replace(/\s+/g, "").toUpperCase() } } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  res.json({ items: rows.map(productDto), total, page, pageSize });
});

/** Marcas usadas en el inventario (para el filtro) */
router.get("/brands", canRead, async (req, res) => {
  const rows = await prisma.product.findMany({
    where: { businessId: ctx(req).businessId, deletedAt: null, brand: { not: null } },
    distinct: ["brand"],
    select: { brand: true },
    orderBy: { brand: "asc" },
  });
  res.json(rows.map((r) => r.brand).filter(Boolean));
});

/** KPIs de inventario: productos, valor a costo y stock bajo */
router.get("/summary", canRead, async (req, res) => {
  const rows = await prisma.product.findMany({
    where: { businessId: ctx(req).businessId, deletedAt: null, isRecipe: false },
    select: {
      cost: true,
      stock: true,
      lowStockAlert: true,
      trackStock: true,
      variants: { where: { deletedAt: null }, select: { stock: true, cost: true } },
    },
  });
  let value = 0;
  let lowStock = 0;
  for (const p of rows) {
    if (!p.trackStock) continue;
    if (p.variants.length) {
      for (const v of p.variants) value += Math.max(v.stock.toNumber(), 0) * (v.cost ?? p.cost).toNumber();
    } else value += Math.max(p.stock.toNumber(), 0) * p.cost.toNumber();
    if (p.stock.lte(p.lowStockAlert)) lowStock++;
  }
  res.json({ count: rows.length, inventoryValue: round2(value), lowStock });
});

router.get("/barcode/:code", canRead, async (req, res) => {
  const businessId = ctx(req).businessId;
  const code = String(req.params.code);
  const product = await prisma.product.findFirst({ where: { businessId, deletedAt: null, barcode: code }, include: productInclude });
  if (product) {
    res.json({ product: productDto(product), variantId: null });
    return;
  }
  const variant = await prisma.productVariant.findFirst({
    where: { barcode: code, deletedAt: null, product: { businessId, deletedAt: null } },
    select: { id: true, productId: true },
  });
  if (!variant) throw notFound("No hay ningún producto con ese código de barras.");
  const parent = await prisma.product.findUniqueOrThrow({ where: { id: variant.productId }, include: productInclude });
  res.json({ product: productDto(parent), variantId: variant.id });
});

// ── Carga masiva ─────────────────────────────────────────────────────

const IMPORT_COLUMNS = [
  "Nombre",
  "Código de barras",
  "Precio de costo",
  "Precio de venta",
  "Categoría",
  "Cantidad",
  "Marca",
  "Compatible con",
  "Garantía días",
];

router.get("/import/template", canEdit, async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Productos");
  ws.columns = IMPORT_COLUMNS.map((header, i) => ({ header, width: i === 0 ? 36 : 18 }));
  ws.getRow(1).font = { bold: true };
  ws.getColumn(2).numFmt = "@";
  ws.addRow(["Funda silicona iPhone 13", "7751234567890", 15, 35, "Fundas", 40, "Genérica", "iPhone 13, iPhone 13 Pro", 0]);
  ws.addRow(["Cargador 20W USB-C", "7751234567906", 45, 89, "Cargadores", 25, "Samsung", "", 90]);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla-productos.xlsx"');
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return String(value.text);
    return "";
  }
  return String(value).trim();
}

function parseNum(raw: string): number | null {
  if (raw === "") return null;
  const normalized = raw.includes(",") && !raw.includes(".") ? raw.replace(",", ".") : raw.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

const importRowSchema = z.object({
  name: reqStr(100),
  barcode,
  cost: money(0).nullish(),
  price: money(0.01),
  category: optStr(60),
  quantity: z.number().int("La cantidad debe ser entera").min(0).max(999_999).nullish(),
  brand: optStr(60),
  compatibleWith: optStr(255),
  warrantyDays: z.number().int("La garantía debe ser en días enteros").min(0).max(3650).nullish(),
});

router.post("/import", canEdit, upload.single("file"), async (req, res) => {
  const { businessId, userId } = ctx(req);
  const file = req.file;
  if (!file) throw badRequest("Selecciona un archivo .xlsx o .csv.");
  const name = file.originalname.toLowerCase();
  const wb = new ExcelJS.Workbook();
  try {
    if (name.endsWith(".csv")) await wb.csv.read(Readable.from(file.buffer));
    else if (name.endsWith(".xlsx")) await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
    else throw new Error("formato");
  } catch {
    throw badRequest("No pudimos leer el archivo. Usa la plantilla en formato .xlsx o un .csv.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw badRequest("El archivo está vacío.");
  if (ws.rowCount > 5001) throw badRequest("Máximo 5000 filas por archivo.");

  const categories = new Map(
    (await prisma.category.findMany({ where: { businessId } })).map((c) => [c.name.toLowerCase(), c.id]),
  );
  const result = { created: 0, updated: 0, errors: [] as { row: number; message: string }[] };

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => cellText(row.getCell(c).value));
    if (cells.every((c) => c === "")) continue;
    const parsed = importRowSchema.safeParse({
      name: cells[0],
      barcode: cells[1],
      cost: parseNum(cells[2]),
      price: parseNum(cells[3]),
      category: cells[4],
      quantity: parseNum(cells[5]),
      brand: cells[6],
      compatibleWith: cells[7],
      warrantyDays: parseNum(cells[8]),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      result.errors.push({ row: r, message: `${issue.path.join(".")}: ${issue.message}` });
      continue;
    }
    const data = parsed.data;
    try {
      await prisma.$transaction(async (tx) => {
        let categoryId: string | null = null;
        if (data.category) {
          const key = data.category.toLowerCase();
          categoryId = categories.get(key) ?? null;
          if (!categoryId) {
            const created = await tx.category.create({ data: { businessId, name: data.category } });
            categoryId = created.id;
            categories.set(key, created.id);
          }
        }
        const existing = await tx.product.findFirst({
          where: {
            businessId,
            deletedAt: null,
            isRecipe: false,
            ...(data.barcode ? { barcode: data.barcode } : { name: { equals: data.name, mode: "insensitive" } }),
          },
          include: { variants: { where: { deletedAt: null }, select: { id: true } } },
        });
        const extra = {
          ...(data.brand ? { brand: data.brand } : {}),
          ...(data.compatibleWith ? { compatibleWith: data.compatibleWith } : {}),
          ...(data.warrantyDays != null ? { warrantyDays: data.warrantyDays } : {}),
        };
        if (existing) {
          await tx.product.update({
            where: { id: existing.id },
            data: {
              name: data.name,
              price: data.price,
              ...(data.cost != null ? { cost: data.cost } : {}),
              ...(categoryId ? { categoryId } : {}),
              ...extra,
            },
          });
          if (existing.serialized && data.quantity != null) {
            throw new Error("Producto controlado por IMEI: su stock se carga registrando los IMEI, no desde Excel.");
          }
          if (data.quantity != null && !existing.variants.length) {
            await moveStock(tx, {
              businessId,
              productId: existing.id,
              quantity: data.quantity,
              type: "ADJUST_SET",
              reason: "Importación desde Excel",
              userId,
            });
          }
          result.updated++;
        } else {
          if (data.barcode) await assertBarcodesFree(tx, businessId, [data.barcode]);
          const product = await tx.product.create({
            data: {
              businessId,
              name: data.name,
              barcode: data.barcode ?? null,
              price: data.price,
              cost: data.cost ?? 0,
              categoryId,
              ...extra,
            },
          });
          if (data.quantity) {
            await moveStock(tx, { businessId, productId: product.id, quantity: data.quantity, type: "INITIAL", userId });
          }
          result.created++;
        }
      });
    } catch (err) {
      result.errors.push({ row: r, message: err instanceof Error ? err.message : "Error al guardar" });
    }
  }
  res.json(result);
});

router.get("/export.xlsx", canRead, async (req, res) => {
  const businessId = ctx(req).businessId;
  const [rows, serials] = await Promise.all([
    prisma.product.findMany({
      where: { businessId, deletedAt: null, isRecipe: false },
      include: { category: { select: { name: true } }, variants: { where: { deletedAt: null } } },
      orderBy: { name: "asc" },
    }),
    prisma.productSerial.findMany({
      where: { businessId, status: "IN_STOCK", product: { deletedAt: null } },
      include: { product: { select: { name: true, brand: true, variants: { select: { id: true, value: true } } } } },
      orderBy: [{ product: { name: "asc" } }, { createdAt: "asc" }],
    }),
  ]);
  const productRows = rows.flatMap((p) => {
    const base = {
      name: p.name,
      brand: p.brand ?? "",
      compatibleWith: p.compatibleWith ?? "",
      category: p.category?.name ?? "",
      barcode: p.barcode ?? "",
      cost: p.cost.toNumber(),
      price: p.price.toNumber(),
      warrantyDays: p.warrantyDays,
      imei: p.serialized ? "Sí" : "No",
      unit: p.unit,
    };
    if (!p.variants.length) {
      return [{ ...base, variant: "", stock: p.stock.toNumber(), value: p.stock.toNumber() * p.cost.toNumber() }];
    }
    return p.variants.map((v) => {
      const cost = (v.cost ?? p.cost).toNumber();
      return {
        ...base,
        variant: `${v.type}: ${v.value}`,
        barcode: v.barcode ?? base.barcode,
        cost,
        price: (v.price ?? p.price).toNumber(),
        stock: v.stock.toNumber(),
        value: v.stock.toNumber() * cost,
      };
    });
  });
  await sendXlsx(res, `inventario-${new Date().toISOString().slice(0, 10)}`, [
    {
      name: "Productos",
      columns: [
        { header: "Producto", key: "name", width: 36 },
        { header: "Variante", key: "variant", width: 16 },
        { header: "Marca", key: "brand", width: 16 },
        { header: "Compatible con", key: "compatibleWith", width: 30 },
        { header: "Categoría", key: "category", width: 16 },
        { header: "Código de barras", key: "barcode", width: 16 },
        { header: "Costo", key: "cost", format: "money" },
        { header: "Precio", key: "price", format: "money" },
        { header: "Stock", key: "stock", format: "qty" },
        { header: "Unidad", key: "unit", width: 8 },
        { header: "Valor a costo", key: "value", format: "money", width: 14 },
        { header: "Garantía (días)", key: "warrantyDays", format: "int", width: 14 },
        { header: "Control IMEI", key: "imei", width: 12 },
      ],
      rows: productRows,
      totals: ["stock", "value"],
    },
    {
      name: "IMEI en stock",
      columns: [
        { header: "IMEI / serie", key: "serial", width: 20 },
        { header: "Producto", key: "product", width: 36 },
        { header: "Variante", key: "variant", width: 14 },
        { header: "Marca", key: "brand", width: 16 },
        { header: "Ingreso", key: "createdAt", format: "datetime", width: 18 },
      ],
      rows: serials.map((x) => ({
        serial: x.serial,
        product: x.product.name,
        variant: x.product.variants.find((v) => v.id === x.variantId)?.value ?? "",
        brand: x.product.brand ?? "",
        createdAt: x.createdAt,
      })),
    },
  ]);
});

// ── Crear / editar ───────────────────────────────────────────────────

const variantSchema = z.object({
  id: optId,
  type: reqStr(30),
  value: reqStr(50),
  price: money(0.01).nullish(),
  cost: money(0).nullish(),
  stock: qty(0, 999_999).nullish(),
  barcode,
});

const productSchema = z.object({
  name: reqStr(100),
  barcode,
  categoryId: optId,
  categoryName: optStr(60),
  imageKey: optStr(300),
  description: optStr(500),
  cost: money(0).nullish(),
  price: money(0.01),
  stock: qty(0, 999_999).nullish(),
  lowStockAlert: qty(0, 9999).nullish(),
  unit: unit.default("UNIT"),
  trackStock: z.boolean().default(true),
  visibleInCatalog: z.boolean().default(true),
  variants: z.array(variantSchema).max(100).default([]),
  brand: optStr(60),
  compatibleWith: optStr(255),
  warrantyDays: z.coerce.number().int().min(0).max(3650).default(0),
  serialized: z.boolean().default(false),
  /** IMEI del stock inicial (al crear un producto con IMEI y sin variantes) */
  serials: z.array(z.string().max(40)).max(2000).default([]),
});

type ProductInput = z.infer<typeof productSchema>;

async function assertBarcodesFree(tx: Tx, businessId: string, codes: string[], excludeProductId?: string) {
  const unique = new Set(codes);
  if (unique.size !== codes.length) throw conflict("Hay códigos de barras repetidos.");
  if (!codes.length) return;
  const clash =
    (await tx.product.findFirst({
      where: { businessId, deletedAt: null, barcode: { in: codes }, ...(excludeProductId ? { id: { not: excludeProductId } } : {}) },
      select: { name: true },
    })) ??
    (await tx.productVariant.findFirst({
      where: {
        barcode: { in: codes },
        deletedAt: null,
        product: { businessId, deletedAt: null, ...(excludeProductId ? { id: { not: excludeProductId } } : {}) },
      },
      select: { product: { select: { name: true } } },
    }).then((v) => (v ? { name: v.product.name } : null)));
  if (clash) throw conflict(`El código de barras ya está asignado a "${clash.name}".`);
}

async function resolveCategory(tx: Tx, businessId: string, data: ProductInput): Promise<string | null> {
  if (data.categoryName) {
    const category = await tx.category.upsert({
      where: { businessId_name: { businessId, name: data.categoryName } },
      create: { businessId, name: data.categoryName },
      update: {},
    });
    return category.id;
  }
  if (data.categoryId) {
    const category = await tx.category.findFirst({ where: { id: data.categoryId, businessId } });
    if (!category) throw badRequest("La categoría no existe.");
    return category.id;
  }
  return null;
}

function checkSerialized(data: ProductInput) {
  if (!data.serialized) return;
  if (data.unit !== "UNIT") throw badRequest("Los productos con IMEI deben usar la unidad «Unidad».");
  if (!data.trackStock) throw badRequest("Los productos con IMEI deben controlar stock.");
}

function checkUnits(data: ProductInput) {
  checkSerialized(data);
  if (data.unit !== "UNIT") return;
  const bad = [data.stock, ...data.variants.map((v) => v.stock)].some((n) => n != null && !Number.isInteger(n));
  if (bad) throw badRequest("Con unidad de medida 'Unidad' el stock debe ser un número entero.");
}

function collectBarcodes(data: ProductInput): string[] {
  return [data.barcode, ...data.variants.map((v) => v.barcode)].filter((c): c is string => Boolean(c));
}

router.get("/:id", canRead, async (req, res) => {
  const product = await prisma.product.findFirst({
    where: { id: String(req.params.id), businessId: ctx(req).businessId, deletedAt: null },
    include: productInclude,
  });
  if (!product) throw notFound("El producto no existe.");
  res.json(productDto(product));
});

router.post("/", canEdit, async (req, res) => {
  const { businessId, userId } = ctx(req);
  const data = productSchema.parse(req.body);
  checkUnits(data);

  const product = await prisma.$transaction(async (tx) => {
    await assertBarcodesFree(tx, businessId, collectBarcodes(data));
    const categoryId = await resolveCategory(tx, businessId, data);
    const created = await tx.product.create({
      data: {
        businessId,
        name: data.name,
        barcode: data.barcode ?? null,
        categoryId,
        imageKey: data.imageKey ?? null,
        description: data.description ?? null,
        cost: data.cost ?? 0,
        price: data.price,
        lowStockAlert: data.lowStockAlert ?? 5,
        unit: data.unit,
        trackStock: data.trackStock,
        visibleInCatalog: data.visibleInCatalog,
        brand: data.brand ?? null,
        compatibleWith: data.compatibleWith ?? null,
        warrantyDays: data.warrantyDays,
        serialized: data.serialized,
      },
    });
    if (data.serialized) {
      // El stock inicial de un producto con IMEI son sus series; las variantes se cargan después
      if (data.variants.some((v) => v.stock)) {
        throw badRequest("En productos con IMEI y variantes, registra los IMEI de cada variante después de crearlo.");
      }
      for (const v of data.variants) {
        await tx.productVariant.create({
          data: { productId: created.id, type: v.type, value: v.value, price: v.price ?? null, cost: v.cost ?? null, barcode: v.barcode ?? null },
        });
      }
      const serials = normalizeSerials(data.serials);
      if (!data.variants.length && (data.stock ?? 0) !== serials.length) {
        throw badRequest(`Registra ${data.stock ?? 0} IMEI para el stock inicial (llevas ${serials.length}).`, {
          serials: "Cantidad distinta al stock",
        });
      }
      if (serials.length) {
        await registerSerials(tx, { businessId, productId: created.id, serials });
        await moveStock(tx, { businessId, productId: created.id, quantity: serials.length, type: "INITIAL", reason: "Ingreso por IMEI", userId });
      }
    } else if (data.variants.length) {
      for (const v of data.variants) {
        const variant = await tx.productVariant.create({
          data: { productId: created.id, type: v.type, value: v.value, price: v.price ?? null, cost: v.cost ?? null, barcode: v.barcode ?? null },
        });
        if (v.stock) {
          await moveStock(tx, { businessId, productId: created.id, variantId: variant.id, quantity: v.stock, type: "INITIAL", userId });
        }
      }
    } else if (data.stock) {
      await moveStock(tx, { businessId, productId: created.id, quantity: data.stock, type: "INITIAL", userId });
    }
    return tx.product.findUniqueOrThrow({ where: { id: created.id }, include: productInclude });
  });
  res.status(201).json(productDto(product));
});

router.put("/:id", canEdit, async (req, res) => {
  const { businessId, userId } = ctx(req);
  const data = productSchema.parse(req.body);
  checkUnits(data);

  const product = await prisma.$transaction(async (tx) => {
    const current = await tx.product.findFirst({
      where: { id: String(req.params.id), businessId, deletedAt: null, isRecipe: false },
      include: { variants: { where: { deletedAt: null } } },
    });
    if (!current) throw notFound("El producto no existe.");
    if (data.serialized && !current.serialized && current.stock.gt(0)) {
      const inStock = await tx.productSerial.count({ where: { productId: current.id, status: "IN_STOCK" } });
      if (!current.stock.eq(inStock)) {
        throw badRequest("Para controlar por IMEI, primero deja el stock en 0 con un ajuste y luego ingresa las unidades con sus IMEI.");
      }
    }
    await assertBarcodesFree(tx, businessId, collectBarcodes(data), current.id);
    const categoryId = await resolveCategory(tx, businessId, data);

    await tx.product.update({
      where: { id: current.id },
      data: {
        name: data.name,
        barcode: data.barcode ?? null,
        categoryId,
        imageKey: data.imageKey ?? null,
        description: data.description ?? null,
        cost: data.cost ?? 0,
        price: data.price,
        lowStockAlert: data.lowStockAlert ?? 5,
        unit: data.unit,
        trackStock: data.trackStock,
        visibleInCatalog: data.visibleInCatalog,
        brand: data.brand ?? null,
        compatibleWith: data.compatibleWith ?? null,
        warrantyDays: data.warrantyDays,
        serialized: data.serialized,
      },
    });

    // Variantes: las existentes se actualizan (su stock solo cambia por ajuste),
    // las nuevas se crean y las que faltan se dan de baja.
    const keep = new Set(data.variants.map((v) => v.id).filter(Boolean));
    const removed = current.variants.filter((v) => !keep.has(v.id));
    if (removed.length) {
      await tx.productVariant.updateMany({ where: { id: { in: removed.map((v) => v.id) } }, data: { deletedAt: new Date() } });
    }
    for (const v of data.variants) {
      const fields = { type: v.type, value: v.value, price: v.price ?? null, cost: v.cost ?? null, barcode: v.barcode ?? null };
      if (v.id) {
        if (!current.variants.some((cv) => cv.id === v.id)) throw badRequest("Una de las variantes no existe.");
        await tx.productVariant.update({ where: { id: v.id }, data: fields });
      } else {
        const variant = await tx.productVariant.create({ data: { productId: current.id, ...fields } });
        if (v.stock && data.serialized) throw badRequest("Registra los IMEI de la variante nueva con «Ajustar stock» → Entrada.");
        if (v.stock) {
          await moveStock(tx, { businessId, productId: current.id, variantId: variant.id, quantity: v.stock, type: "INITIAL", userId });
        }
      }
    }
    if (removed.length || data.variants.length) {
      const sum = await tx.productVariant.aggregate({ where: { productId: current.id, deletedAt: null }, _sum: { stock: true } });
      const remaining = await tx.productVariant.count({ where: { productId: current.id, deletedAt: null } });
      if (remaining) await tx.product.update({ where: { id: current.id }, data: { stock: sum._sum.stock ?? 0 } });
    }
    return tx.product.findUniqueOrThrow({ where: { id: current.id }, include: productInclude });
  });
  res.json(productDto(product));
});

router.delete("/:id", canEdit, async (req, res) => {
  const { count } = await prisma.product.updateMany({
    where: { id: String(req.params.id), businessId: ctx(req).businessId, deletedAt: null },
    data: { deletedAt: new Date(), visibleInCatalog: false },
  });
  if (!count) throw notFound("El producto no existe.");
  res.json({ ok: true });
});

// ── Ajuste de stock y kardex ─────────────────────────────────────────

const adjustSchema = z.object({
  variantId: optId,
  type: z.enum(["IN", "OUT", "SET"]),
  quantity: qty(0, 999_999),
  reason: optStr(255),
  /** Productos con IMEI: series que entran (IN) o salen (OUT) */
  serials: z.array(z.string().max(40)).max(2000).default([]),
  /** OUT con IMEI: marcar como defectuoso (conserva el historial) o eliminar el registro */
  serialAction: z.enum(["DEFECTIVE", "DELETE"]).default("DEFECTIVE"),
});

router.post("/:id/adjust", canEdit, async (req, res) => {
  const { businessId, userId } = ctx(req);
  const data = adjustSchema.parse(req.body);
  if (data.type !== "SET" && data.quantity <= 0) throw badRequest("La cantidad debe ser mayor a 0.", { quantity: "Debe ser mayor a 0" });

  const movement = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: String(req.params.id), businessId, deletedAt: null },
      include: { variants: { where: { deletedAt: null }, select: { id: true } } },
    });
    if (!product) throw notFound("El producto no existe.");
    if (product.isRecipe || !product.trackStock) throw badRequest("Este producto no controla stock.");
    if (product.variants.length && !data.variantId) throw badRequest("Selecciona la variante a ajustar.", { variantId: "Requerido" });
    if (product.unit === "UNIT" && !Number.isInteger(data.quantity)) throw badRequest("La cantidad debe ser un número entero.");
    if (product.serialized) {
      if (data.type === "SET") throw badRequest("En productos con IMEI usa Entrada o Salida indicando los IMEI.");
      const serials = normalizeSerials(data.serials);
      if (serials.length !== data.quantity) {
        throw badRequest(`Indica ${data.quantity} IMEI (llevas ${serials.length}).`, { serials: "Cantidad distinta" });
      }
      if (data.type === "IN") {
        await registerSerials(tx, { businessId, productId: product.id, variantId: data.variantId, serials, notes: data.reason });
      } else {
        const rows = await tx.productSerial.findMany({
          where: { businessId, productId: product.id, serial: { in: serials }, status: "IN_STOCK", variantId: data.variantId ?? null },
        });
        if (rows.length !== serials.length) throw badRequest("Algún IMEI no está en stock para este producto o variante.");
        if (data.serialAction === "DELETE") {
          await tx.productSerial.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
        } else {
          await tx.productSerial.updateMany({
            where: { id: { in: rows.map((r) => r.id) } },
            data: { status: "DEFECTIVE", notes: data.reason ?? "Baja por ajuste" },
          });
        }
      }
    }
    const map = { IN: ["ADJUST_IN", data.quantity], OUT: ["ADJUST_OUT", -data.quantity], SET: ["ADJUST_SET", data.quantity] } as const;
    const [type, quantity] = map[data.type];
    return moveStock(tx, {
      businessId,
      productId: product.id,
      variantId: data.variantId ?? null,
      quantity,
      type,
      reason: data.reason ?? (product.serialized ? "Ajuste por IMEI" : null),
      userId,
    });
  });
  res.status(201).json(movement);
});

// ── IMEI / series ────────────────────────────────────────────────────

const serialListSchema = z.object({
  status: z.enum(["IN_STOCK", "SOLD", "RETURNED", "DEFECTIVE"]).optional(),
  variantId: z.string().max(40).optional(),
  q: z.string().trim().max(40).optional(),
});

router.get("/:id/serials", canRead, async (req, res) => {
  const businessId = ctx(req).businessId;
  const { status, variantId, q } = serialListSchema.parse(req.query);
  const product = await prisma.product.findFirst({
    where: { id: String(req.params.id), businessId },
    select: { id: true, variants: { select: { id: true, value: true } } },
  });
  if (!product) throw notFound("El producto no existe.");
  const rows = await prisma.productSerial.findMany({
    where: {
      productId: product.id,
      businessId,
      ...(status ? { status } : {}),
      ...(variantId ? { variantId } : {}),
      ...(q ? { serial: { contains: q.replace(/\s+/g, "").toUpperCase() } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      serial: r.serial,
      status: r.status,
      variantId: r.variantId,
      variant: product.variants.find((v) => v.id === r.variantId)?.value ?? null,
      saleId: r.saleId,
      soldAt: r.soldAt,
      notes: r.notes,
      createdAt: r.createdAt,
    })),
  );
});

const addSerialsSchema = z.object({
  serials: z.array(z.string().max(40)).min(1, "Ingresa al menos un IMEI").max(2000),
  variantId: optId,
  reason: optStr(255),
});

/** Ingreso de unidades por IMEI: crea las series y suma el stock */
router.post("/:id/serials", canEdit, async (req, res) => {
  const { businessId, userId } = ctx(req);
  const data = addSerialsSchema.parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: String(req.params.id), businessId, deletedAt: null },
      include: { variants: { where: { deletedAt: null }, select: { id: true } } },
    });
    if (!product) throw notFound("El producto no existe.");
    if (!product.serialized) throw badRequest("Este producto no se controla por IMEI.");
    if (product.variants.length && !data.variantId) throw badRequest("Selecciona la variante.", { variantId: "Requerido" });
    const serials = await registerSerials(tx, {
      businessId,
      productId: product.id,
      variantId: data.variantId,
      serials: data.serials,
      notes: data.reason,
    });
    await moveStock(tx, {
      businessId,
      productId: product.id,
      variantId: data.variantId ?? null,
      quantity: serials.length,
      type: "ADJUST_IN",
      reason: data.reason ?? "Ingreso por IMEI",
      userId,
    });
    return { added: serials.length };
  });
  res.status(201).json(result);
});

router.get("/:id/movements", canRead, async (req, res) => {
  const businessId = ctx(req).businessId;
  const product = await prisma.product.findFirst({ where: { id: String(req.params.id), businessId }, select: { id: true } });
  if (!product) throw notFound("El producto no existe.");
  const movements = await prisma.stockMovement.findMany({
    where: { productId: product.id, businessId },
    include: { variant: { select: { value: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(
    movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      stockAfter: m.stockAfter,
      reason: m.reason,
      variant: m.variant?.value ?? null,
      refId: m.refId,
      createdAt: m.createdAt,
    })),
  );
});

export default router;
