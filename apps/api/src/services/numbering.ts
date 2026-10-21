import type { Tx } from "../lib/prisma.js";

type Counter = "nextSaleNumber" | "nextQuoteNumber" | "nextInvoiceNumber" | "nextRepairNumber";

/** Reserva el siguiente correlativo del negocio. El UPDATE bloquea la fila hasta el commit. */
export async function nextNumber(tx: Tx, businessId: string, counter: Counter): Promise<number> {
  const updated = await tx.business.update({
    where: { id: businessId },
    data: { [counter]: { increment: 1 } },
    select: { [counter]: true } as Record<Counter, true>,
  });
  return (updated as Record<Counter, number>)[counter] - 1;
}
