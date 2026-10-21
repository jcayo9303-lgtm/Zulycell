import { PrismaClient, Prisma } from "@prisma/client";

// La base está en Supabase (us-east-1): cada consulta suma latencia de red, así que las
// transacciones de venta/compra necesitan más que los 5 s por defecto.
export const prisma = new PrismaClient({
  transactionOptions: { maxWait: 10_000, timeout: 30_000 },
});

export type Tx = Prisma.TransactionClient;
export { Prisma };
