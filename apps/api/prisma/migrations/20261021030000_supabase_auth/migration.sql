-- Vincula los usuarios con Supabase Auth
ALTER TABLE "User" ADD COLUMN "authId" UUID;
CREATE UNIQUE INDEX "User_authId_key" ON "User"("authId");
