-- Enable Row Level Security (RLS) on all public tables
-- Keep backend compatibility by allowing service/backend DB roles explicitly.

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename <> '_prisma_migrations'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);

        EXECUTE format('DROP POLICY IF EXISTS backend_full_access ON public.%I', t.tablename);

        EXECUTE format(
            'CREATE POLICY backend_full_access ON public.%I
             FOR ALL
             USING (
                current_user = ''service_role''
                OR current_user LIKE ''postgres%%''
                OR COALESCE(current_setting(''request.jwt.claim.role'', true), '''') = ''service_role''
             )
             WITH CHECK (
                current_user = ''service_role''
                OR current_user LIKE ''postgres%%''
                OR COALESCE(current_setting(''request.jwt.claim.role'', true), '''') = ''service_role''
             )',
            t.tablename
        );
    END LOOP;
END
$$;
