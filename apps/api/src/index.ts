import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

// Servidor para Docker y desarrollo local. En Netlify la API corre como función (src/lambda.ts).
if (!config.supabase.secretKey) {
  logger.warn("SUPABASE_SECRET_KEY no está configurada: la subida de imágenes no funcionará.");
}

const server = createApp().listen(config.port, () => {
  logger.info(`API zulycell escuchando en :${config.port}`);
});

async function shutdown() {
  logger.info("Cerrando API...");
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
