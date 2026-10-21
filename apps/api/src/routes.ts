import { Router } from "express";
import { prisma } from "./lib/prisma.js";
import { requireAuth } from "./middleware/auth.js";

import authRouter from "./modules/auth.js";
import metaRouter from "./modules/meta.js";
import uploadsRouter from "./modules/uploads.js";
import businessRouter from "./modules/business.js";
import categoriesRouter from "./modules/categories.js";
import productsRouter from "./modules/products.js";
import recipesRouter from "./modules/recipes.js";
import salesRouter from "./modules/sales.js";
import expensesRouter from "./modules/expenses.js";
import balanceRouter from "./modules/balance.js";
import statsRouter from "./modules/stats.js";
import clientsRouter from "./modules/clients.js";
import suppliersRouter from "./modules/suppliers.js";
import purchasesRouter from "./modules/purchases.js";
import quotesRouter from "./modules/quotes.js";
import employeesRouter from "./modules/employees.js";
import invoicesRouter from "./modules/invoices.js";
import catalogRouter, { publicCatalogRouter } from "./modules/catalog.js";
import paymentRequestsRouter, { publicPayRouter } from "./modules/payment-requests.js";
import repairsRouter from "./modules/repairs.js";
import cashRouter from "./modules/cash.js";
import warrantyRouter from "./modules/warranty.js";

export const apiRouter = Router();

apiRouter.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true });
});

// Públicas (sin sesión)
apiRouter.use("/auth", authRouter);
apiRouter.use("/meta", metaRouter);
apiRouter.use("/public/catalog", publicCatalogRouter);
apiRouter.use("/public/pay", publicPayRouter);

// Privadas (requieren sesión y negocio activo)
apiRouter.use(requireAuth);
apiRouter.use("/uploads", uploadsRouter);
apiRouter.use("/business", businessRouter);
apiRouter.use("/categories", categoriesRouter);
apiRouter.use("/products", productsRouter);
apiRouter.use("/recipes", recipesRouter);
apiRouter.use("/sales", salesRouter);
apiRouter.use("/expenses", expensesRouter);
apiRouter.use("/balance", balanceRouter);
apiRouter.use("/stats", statsRouter);
apiRouter.use("/clients", clientsRouter);
apiRouter.use("/suppliers", suppliersRouter);
apiRouter.use("/purchases", purchasesRouter);
apiRouter.use("/quotes", quotesRouter);
apiRouter.use("/employees", employeesRouter);
apiRouter.use("/invoices", invoicesRouter);
apiRouter.use("/catalog", catalogRouter);
apiRouter.use("/payment-requests", paymentRequestsRouter);
apiRouter.use("/repairs", repairsRouter);
apiRouter.use("/cash", cashRouter);
apiRouter.use("/warranty", warrantyRouter);
