import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { dateStr } from "../lib/validate.js";
import { dayRangeUtc, todayYmd } from "../lib/dates.js";
import { round2 } from "../lib/money.js";
import { ctx, requirePerm } from "../middleware/auth.js";

const router = Router();

router.get("/", requirePerm("balance_view", "sales_view", "expenses_view"), async (req, res) => {
  const a = ctx(req);
  const { date } = z.object({ date: dateStr.optional() }).parse(req.query);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: a.businessId }, select: { timezone: true } });
  const day = date ?? todayYmd(business.timezone);
  const range = dayRangeUtc(business.timezone, day, day);

  const saleWhere = { businessId: a.businessId, status: "COMPLETED" as const, createdAt: range };
  const [sales, byMethod, expenses, repairs] = await Promise.all([
    prisma.sale.aggregate({ where: saleWhere, _sum: { total: true }, _count: true }),
    prisma.sale.groupBy({ by: ["method"], where: saleWhere, _sum: { total: true } }),
    prisma.expense.aggregate({
      where: { businessId: a.businessId, deletedAt: null, date: range },
      _sum: { amount: true },
    }),
    prisma.repairPayment.aggregate({ where: { businessId: a.businessId, createdAt: range }, _sum: { amount: true }, _count: true }),
  ]);

  const salesTotal = sales._sum.total?.toNumber() ?? 0;
  const expensesTotal = expenses._sum.amount?.toNumber() ?? 0;
  const repairsTotal = repairs._sum.amount?.toNumber() ?? 0;
  const methods = byMethod.map((m) => ({ method: m.method, total: m._sum.total?.toNumber() ?? 0 }));
  res.json({
    date: day,
    salesTotal,
    salesCount: sales._count,
    expensesTotal,
    repairsTotal,
    repairsCount: repairs._count,
    balance: round2(salesTotal + repairsTotal - expensesTotal),
    byMethod: methods,
    creditSales: methods.find((m) => m.method === "CREDIT")?.total ?? 0,
  });
});

export default router;
