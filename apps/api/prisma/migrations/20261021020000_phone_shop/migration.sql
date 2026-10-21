-- CreateEnum
CREATE TYPE "SerialStatus" AS ENUM ('IN_STOCK', 'SOLD', 'RETURNED', 'DEFECTIVE');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('RECEIVED', 'DIAGNOSING', 'WAITING_PARTS', 'REPAIRING', 'READY', 'DELIVERED', 'UNREPAIRABLE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('IN', 'OUT');

-- AlterEnum
ALTER TYPE "BusinessType" ADD VALUE 'CELULARES';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'REPAIR';
ALTER TYPE "StockMovementType" ADD VALUE 'REPAIR_RETURN';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "nextRepairNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "repairTerms" VARCHAR(1000);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "brand" VARCHAR(60),
ADD COLUMN     "compatibleWith" VARCHAR(255),
ADD COLUMN     "serialized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "warrantyDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "serials" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "warrantyUntil" DATE;

-- CreateTable
CREATE TABLE "ProductSerial" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "serial" VARCHAR(30) NOT NULL,
    "status" "SerialStatus" NOT NULL DEFAULT 'IN_STOCK',
    "saleId" TEXT,
    "purchaseId" TEXT,
    "notes" VARCHAR(255),
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairOrder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "RepairStatus" NOT NULL DEFAULT 'RECEIVED',
    "deviceType" VARCHAR(30) NOT NULL DEFAULT 'Celular',
    "brand" VARCHAR(60) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "imei" VARCHAR(30),
    "color" VARCHAR(30),
    "accessCode" VARCHAR(60),
    "accessories" VARCHAR(255),
    "reportedIssue" VARCHAR(500) NOT NULL,
    "physicalCondition" VARCHAR(500),
    "diagnosis" VARCHAR(1000),
    "technicianId" TEXT,
    "estimatedCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "partsTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "warrantyDays" INTEGER NOT NULL DEFAULT 30,
    "promisedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "notes" VARCHAR(500),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairPart" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "name" VARCHAR(160) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "notes" VARCHAR(255),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedBy" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingAmount" DECIMAL(14,2) NOT NULL,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "expectedCash" DECIMAL(14,2),
    "countedCash" DECIMAL(14,2),
    "difference" DECIMAL(14,2),
    "summary" JSONB,
    "notes" VARCHAR(500),

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSerial_productId_status_idx" ON "ProductSerial"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSerial_businessId_serial_key" ON "ProductSerial"("businessId", "serial");

-- CreateIndex
CREATE INDEX "RepairOrder_businessId_status_idx" ON "RepairOrder"("businessId", "status");

-- CreateIndex
CREATE INDEX "RepairOrder_businessId_createdAt_idx" ON "RepairOrder"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RepairOrder_businessId_number_key" ON "RepairOrder"("businessId", "number");

-- CreateIndex
CREATE INDEX "RepairPayment_businessId_createdAt_idx" ON "RepairPayment"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "CashSession_businessId_openedAt_idx" ON "CashSession"("businessId", "openedAt");

-- AddForeignKey
ALTER TABLE "ProductSerial" ADD CONSTRAINT "ProductSerial_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSerial" ADD CONSTRAINT "ProductSerial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPart" ADD CONSTRAINT "RepairPart_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPart" ADD CONSTRAINT "RepairPart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPayment" ADD CONSTRAINT "RepairPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPayment" ADD CONSTRAINT "RepairPayment_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

