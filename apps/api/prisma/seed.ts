// Datos de demostración: tienda de celulares, accesorios y servicio técnico.
// Idempotente: si el negocio "demo" ya existe no hace nada.
// Acceso: celular 70000001 (propietario) o 70000002 (empleado/técnico); el OTP sale en el log
// de la API o en la respuesta si OTP_DEV_ECHO=true.

import { PrismaClient, type PaymentMethod } from "@prisma/client";

const prisma = new PrismaClient({ transactionOptions: { timeout: 60_000 } });
const DAY = 86_400_000;

async function main() {
  if (await prisma.business.findUnique({ where: { slug: "demo" } })) {
    console.log("[seed] El negocio demo ya existe, se omite.");
    return;
  }

  const owner = await prisma.user.upsert({
    where: { phone: "70000001" },
    update: {},
    // Con este email (cuenta de Supabase Auth) se entra como propietario del demo
    create: { phone: "70000001", email: process.env.SEED_OWNER_EMAIL ?? "demo@zulycell.local", name: "Zulema Cayo" },
  });
  const tech = await prisma.user.upsert({
    where: { phone: "70000002" },
    update: {},
    create: { phone: "70000002", name: "Carlos Mamani" },
  });

  const business = await prisma.business.create({
    data: {
      name: "ZulyCell Accesorios",
      type: "CELULARES",
      country: "BO",
      currency: "BOB",
      timezone: "America/La_Paz",
      ownerName: owner.name,
      plan: "PRO",
      slug: "demo",
      address: "Calle Eloy Salmón 1050, La Paz",
      phone: "70000001",
      taxId: "1020304050",
      receiptFooter: "Los productos con garantía requieren este comprobante. ¡Gracias por su compra!",
      repairTerms:
        "1. El equipo se entrega solo con esta orden. 2. Pasados 60 días sin recoger, el taller no se responsabiliza del equipo. " +
        "3. La garantía cubre solo la reparación realizada, no daños por humedad o golpes. 4. Los equipos mojados se reciben sin garantía.",
      catalogDescription: "Cargadores, fundas, micas, audífonos, memorias y celulares. Servicio técnico especializado.",
      catalogWhatsapp: "59170000001",
    },
  });

  await prisma.membership.createMany({
    data: [
      { userId: owner.id, businessId: business.id, role: "OWNER" },
      {
        userId: tech.id,
        businessId: business.id,
        role: "EMPLOYEE",
        position: "Técnico y vendedor",
        permissions: {
          sales_view: true,
          sales_create: true,
          inventory_view: true,
          clients_view: true,
          clients_edit: true,
          repairs_view: true,
          repairs_edit: true,
          cash_manage: true,
        },
      },
    ],
  });

  const cat = async (name: string) => (await prisma.category.create({ data: { businessId: business.id, name } })).id;
  const C = {
    celulares: await cat("Celulares"),
    cargadores: await cat("Cargadores y cables"),
    fundas: await cat("Fundas y micas"),
    audio: await cat("Audífonos y parlantes"),
    memorias: await cat("Memorias y tarjetas SD"),
    baterias: await cat("Baterías y power banks"),
    repuestos: await cat("Repuestos"),
    servicios: await cat("Servicios"),
  };

  type P = {
    name: string;
    cat: string;
    cost: number;
    price: number;
    stock?: number;
    brand?: string;
    compat?: string;
    warranty?: number;
    barcode?: string;
    alert?: number;
    service?: boolean;
    visible?: boolean;
    imeis?: string[];
  };

  const items: P[] = [
    { name: "Samsung Galaxy A15 128 GB", cat: C.celulares, brand: "Samsung", cost: 1050, price: 1350, warranty: 365, imeis: ["356789104512341", "356789104512358", "356789104512365"] },
    { name: "Xiaomi Redmi 13C 128 GB", cat: C.celulares, brand: "Xiaomi", cost: 820, price: 1090, warranty: 365, imeis: ["861234056789012", "861234056789029"] },
    { name: "Cargador rápido 25 W USB-C", cat: C.cargadores, brand: "Samsung", cost: 45, price: 85, stock: 30, warranty: 90, barcode: "8806094937014" },
    { name: "Cargador 20 W para iPhone", cat: C.cargadores, brand: "Apple", compat: "iPhone 11, 12, 13, 14, 15", cost: 60, price: 120, stock: 15, warranty: 90, barcode: "0194252156711" },
    { name: "Cable USB-C a USB-C 1 m", cat: C.cargadores, brand: "Baseus", cost: 15, price: 35, stock: 50, warranty: 30, barcode: "6953156202146" },
    { name: "Cable Lightning 1 m", cat: C.cargadores, brand: "Genérico", compat: "iPhone 5 a iPhone 14", cost: 10, price: 25, stock: 40, warranty: 30 },
    { name: "Funda silicona iPhone 13", cat: C.fundas, brand: "Genérico", compat: "iPhone 13, iPhone 14", cost: 12, price: 35, stock: 25 },
    { name: "Funda antigolpes Galaxy A15", cat: C.fundas, brand: "Genérico", compat: "Samsung Galaxy A15", cost: 10, price: 30, stock: 20 },
    { name: "Mica de vidrio templado 9D", cat: C.fundas, brand: "Genérico", compat: "Varios modelos", cost: 3, price: 15, stock: 120, alert: 20 },
    { name: "Audífonos Bluetooth TWS", cat: C.audio, brand: "Xiaomi", cost: 80, price: 150, stock: 12, warranty: 90 },
    { name: "Audífonos con cable 3.5 mm", cat: C.audio, brand: "Genérico", cost: 8, price: 20, stock: 4, alert: 6 },
    { name: "Tarjeta microSD 64 GB Clase 10", cat: C.memorias, brand: "SanDisk", cost: 35, price: 60, stock: 20, warranty: 180, barcode: "0619659188450" },
    { name: "Tarjeta microSD 128 GB", cat: C.memorias, brand: "Kingston", cost: 55, price: 95, stock: 10, warranty: 180 },
    { name: "Memoria USB 32 GB", cat: C.memorias, brand: "Kingston", cost: 25, price: 45, stock: 3, alert: 5, warranty: 180 },
    { name: "Power bank 10 000 mAh", cat: C.baterias, brand: "Xiaomi", cost: 90, price: 160, stock: 8, warranty: 180 },
    { name: "Batería para Galaxy A10", cat: C.repuestos, brand: "Samsung", compat: "Samsung Galaxy A10, A10s", cost: 40, price: 90, stock: 6, warranty: 90, visible: false },
    { name: "Pantalla Redmi Note 11", cat: C.repuestos, brand: "Xiaomi", compat: "Redmi Note 11, Note 11S", cost: 180, price: 320, stock: 3, warranty: 90, visible: false },
    { name: "Pin de carga USB-C", cat: C.repuestos, brand: "Genérico", cost: 8, price: 30, stock: 25, visible: false },
    { name: "Instalación de mica", cat: C.servicios, cost: 0, price: 5, service: true },
    { name: "Configuración y respaldo de datos", cat: C.servicios, cost: 0, price: 40, service: true },
  ];

  const products = new Map<string, { id: string; price: number; cost: number; warranty: number; imeis: string[] }>();
  for (const p of items) {
    const stock = p.imeis ? p.imeis.length : p.stock ?? 0;
    const created = await prisma.product.create({
      data: {
        businessId: business.id,
        name: p.name,
        barcode: p.barcode,
        brand: p.brand,
        compatibleWith: p.compat,
        warrantyDays: p.warranty ?? 0,
        serialized: Boolean(p.imeis),
        categoryId: p.cat,
        cost: p.cost,
        price: p.price,
        stock: p.service ? 0 : stock,
        trackStock: !p.service,
        lowStockAlert: p.alert ?? (p.imeis ? 1 : 5),
        visibleInCatalog: p.visible ?? true,
        stockMovements: p.service
          ? undefined
          : { create: { businessId: business.id, type: "INITIAL", quantity: stock, stockAfter: stock } },
        serials: p.imeis
          ? { create: p.imeis.map((serial) => ({ businessId: business.id, serial })) }
          : undefined,
      },
    });
    products.set(p.name, { id: created.id, price: p.price, cost: p.cost, warranty: p.warranty ?? 0, imeis: p.imeis ?? [] });
  }

  // Funda con variantes de color
  await prisma.product.create({
    data: {
      businessId: business.id,
      name: "Funda magnética iPhone 15",
      brand: "Genérico",
      compatibleWith: "iPhone 15, iPhone 15 Pro",
      categoryId: C.fundas,
      cost: 25,
      price: 60,
      stock: 14,
      variants: {
        create: [
          { type: "Color", value: "Negro", stock: 6 },
          { type: "Color", value: "Transparente", stock: 5 },
          { type: "Color", value: "Azul", stock: 3 },
        ],
      },
    },
  });

  const [ana, pedro, luis] = await Promise.all([
    prisma.client.create({ data: { businessId: business.id, name: "Ana Quispe", phone: "71234567", document: "6543210" } }),
    prisma.client.create({ data: { businessId: business.id, name: "Pedro Rojas", phone: "72345678", document: "4455667 LP" } }),
    prisma.client.create({ data: { businessId: business.id, name: "Luis Choque", phone: "73456789" } }),
  ]);
  const supplier = await prisma.supplier.create({
    data: { businessId: business.id, name: "Importadora Tecno Andina SRL", phone: "22445566", document: "1029384756", email: "ventas@tecnoandina.bo" },
  });

  // Ventas de los últimos 30 días (accesorios; sin descontar stock para mantener el demo simple)
  const accesorios = [...products.entries()].filter(([, p]) => p.imeis.length === 0 && p.price < 200);
  const methods: PaymentMethod[] = ["CASH", "CASH", "QR", "QR", "CARD", "TRANSFER"];
  let number = 1;
  for (let d = 29; d >= 1; d--) {
    const perDay = 3 + ((d * 7) % 5);
    for (let k = 0; k < perDay; k++) {
      const lines = [0, 1].map((j) => {
        const [name, p] = accesorios[(d * 3 + k * 5 + j * 7) % accesorios.length];
        const quantity = 1 + ((d + k + j) % 2);
        return { productId: p.id, name, quantity, unitPrice: p.price, unitCost: p.cost, subtotal: quantity * p.price };
      });
      const total = lines.reduce((a, l) => a + l.subtotal, 0);
      const credit = d % 11 === 0 && k === 0;
      const sale = await prisma.sale.create({
        data: {
          businessId: business.id,
          number: number++,
          userId: k % 2 ? tech.id : owner.id,
          clientId: credit ? ana.id : k === 1 ? pedro.id : null,
          subtotal: total,
          total,
          method: credit ? "CREDIT" : methods[(d + k) % methods.length],
          createdAt: new Date(Date.now() - d * DAY - (k + 2) * 3_600_000),
          items: { create: lines },
        },
      });
      if (credit) {
        await prisma.clientMovement.create({
          data: { businessId: business.id, clientId: ana.id, type: "DEBT", amount: total, description: `Venta a crédito #${sale.number}`, saleId: sale.id, createdAt: sale.createdAt },
        });
      }
    }
  }

  // Un celular vendido con IMEI y garantía
  const galaxy = products.get("Samsung Galaxy A15 128 GB")!;
  const soldImei = galaxy.imeis[0];
  const soldAt = new Date(Date.now() - 10 * DAY);
  const phoneSale = await prisma.sale.create({
    data: {
      businessId: business.id,
      number: number++,
      userId: owner.id,
      clientId: luis.id,
      subtotal: galaxy.price,
      total: galaxy.price,
      method: "QR",
      createdAt: soldAt,
      items: {
        create: {
          productId: galaxy.id,
          name: "Samsung Galaxy A15 128 GB",
          quantity: 1,
          unitPrice: galaxy.price,
          unitCost: galaxy.cost,
          subtotal: galaxy.price,
          serials: [soldImei],
          warrantyUntil: new Date(soldAt.getTime() + galaxy.warranty * DAY),
        },
      },
    },
  });
  await prisma.productSerial.update({
    where: { businessId_serial: { businessId: business.id, serial: soldImei } },
    data: { status: "SOLD", saleId: phoneSale.id, soldAt },
  });
  await prisma.product.update({ where: { id: galaxy.id }, data: { stock: galaxy.imeis.length - 1 } });
  await prisma.business.update({ where: { id: business.id }, data: { nextSaleNumber: number } });

  await prisma.clientMovement.create({
    data: { businessId: business.id, clientId: ana.id, type: "PAYMENT", amount: 30, method: "CASH", description: "Abono" },
  });

  // Órdenes de reparación en distintos estados
  const pantalla = products.get("Pantalla Redmi Note 11")!;
  const repairs = [
    { client: pedro.id, brand: "Xiaomi", model: "Redmi Note 11", imei: "869876543210987", issue: "Pantalla rota, no responde el táctil", status: "REPAIRING" as const, labor: 80, estimated: 400, advance: 100, part: pantalla },
    { client: ana.id, brand: "Samsung", model: "Galaxy A10", imei: "354321098765432", issue: "No carga, se apaga solo", status: "READY" as const, labor: 60, estimated: 150, advance: 50, part: null },
    { client: luis.id, brand: "Apple", model: "iPhone 11", imei: "353987654321098", issue: "Se mojó, no enciende", status: "DIAGNOSING" as const, labor: 0, estimated: 250, advance: 0, part: null },
  ];
  let repairNumber = 1;
  for (const [i, r] of repairs.entries()) {
    const partsTotal = r.part ? r.part.price : 0;
    const total = r.labor + partsTotal;
    const order = await prisma.repairOrder.create({
      data: {
        businessId: business.id,
        number: repairNumber++,
        clientId: r.client,
        status: r.status,
        brand: r.brand,
        model: r.model,
        imei: r.imei,
        accessories: "Chip, funda",
        reportedIssue: r.issue,
        physicalCondition: "Rayones leves en la parte trasera",
        estimatedCost: r.estimated,
        laborCost: r.labor,
        partsTotal,
        total,
        paid: r.advance,
        technicianId: tech.id,
        userId: owner.id,
        promisedAt: new Date(Date.now() + (i + 1) * DAY),
        createdAt: new Date(Date.now() - (3 - i) * DAY),
        parts: r.part
          ? { create: { productId: r.part.id, name: "Pantalla Redmi Note 11", quantity: 1, unitPrice: r.part.price, unitCost: r.part.cost, subtotal: r.part.price } }
          : undefined,
        payments: r.advance
          ? { create: { businessId: business.id, amount: r.advance, method: "CASH", notes: "Adelanto", userId: owner.id } }
          : undefined,
      },
    });
    if (r.part) {
      const after = await prisma.product.update({ where: { id: r.part.id }, data: { stock: { decrement: 1 } } });
      await prisma.stockMovement.create({
        data: { businessId: business.id, productId: r.part.id, type: "REPAIR", quantity: -1, stockAfter: after.stock, refId: order.id, reason: `Orden de reparación #${order.number}` },
      });
    }
  }
  await prisma.business.update({ where: { id: business.id }, data: { nextRepairNumber: repairNumber } });

  await prisma.expense.createMany({
    data: [
      { businessId: business.id, amount: 2500, category: "RENT", description: "Alquiler del local", method: "TRANSFER", date: new Date(Date.now() - 20 * DAY) },
      { businessId: business.id, amount: 180, category: "UTILITIES", description: "Luz e internet", method: "CASH", date: new Date(Date.now() - 12 * DAY) },
      { businessId: business.id, amount: 60, category: "TRANSPORT", description: "Envío de mercadería", method: "CASH", supplierId: supplier.id, date: new Date(Date.now() - 3 * DAY) },
    ],
  });
  await prisma.supplierMovement.create({
    data: { businessId: business.id, supplierId: supplier.id, type: "DEBT", amount: 1200, description: "Saldo inicial" },
  });

  console.log(`[seed] Negocio demo creado (${business.name}): ${number - 1} ventas, ${repairNumber - 1} reparaciones.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
