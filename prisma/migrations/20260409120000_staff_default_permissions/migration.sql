-- Align STAFF default permissions with admin UI keys (dot notation).
-- Backfill only when empty or legacy colon-separated keys; skip customized dot-only lists.
UPDATE roles
SET permissions = '["movies.read","movies.write","cinemas.read","rooms.read","showtimes.read","showtimes.write","bookings.read","bookings.write","promotions.read","pricing.read","reports.read","analytics.read"]'::jsonb,
    updated_at = NOW()
WHERE name = 'STAFF'
  AND (
    permissions IS NULL
    OR jsonb_array_length(permissions) = 0
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(permissions) AS elem
      WHERE elem LIKE '%:%'
    )
  );
