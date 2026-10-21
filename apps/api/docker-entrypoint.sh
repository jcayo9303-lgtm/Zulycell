#!/bin/sh
set -e

echo "[api] Aplicando migraciones..."
# El pooler de Supabase puede retener el advisory lock de Prisma; se desactiva para migrar
PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 npx prisma migrate deploy


exec node dist/index.js
