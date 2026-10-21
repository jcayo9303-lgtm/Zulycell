-- Supabase publica el esquema public por su API REST (PostgREST) con la clave pública del navegador.
-- La app no usa esa API: todo pasa por la API Express, que conecta como el dueño de las tablas y no
-- está sujeta a RLS. Con RLS activo y sin políticas, anon/authenticated no ven ni modifican nada.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;

-- Las tablas que creen migraciones futuras tampoco quedan expuestas
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
