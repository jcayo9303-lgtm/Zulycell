-- El correlativo de factura se asigna al emitir
ALTER TABLE "Invoice" ALTER COLUMN "number" DROP NOT NULL;
