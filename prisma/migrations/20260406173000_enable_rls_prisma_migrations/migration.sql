-- Ensure _prisma_migrations is protected by RLS as well.
ALTER TABLE IF EXISTS public._prisma_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backend_full_access ON public._prisma_migrations;

CREATE POLICY backend_full_access
ON public._prisma_migrations
FOR ALL
USING (
  current_user = 'service_role'
  OR current_user LIKE 'postgres%'
  OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
)
WITH CHECK (
  current_user = 'service_role'
  OR current_user LIKE 'postgres%'
  OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
);
