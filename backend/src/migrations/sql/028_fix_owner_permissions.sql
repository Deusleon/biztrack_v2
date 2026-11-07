-- =====================================================
-- Migration 028: Backfill Owner role permissions
-- =====================================================
-- Ensures that every user with the "Owner" role in store_users
-- has all permissions granted for their store.
-- This fixes existing stores created before auto-grant was introduced.

INSERT INTO role_permissions (role_id, permission_id, is_allowed, store_id)
SELECT
    su.role_id,
    p.id       AS permission_id,
    true       AS is_allowed,
    su.store_id
FROM store_users su
JOIN roles r ON r.id = su.role_id
CROSS JOIN permissions p
WHERE r.name = 'Owner'
  AND NOT EXISTS (
      SELECT 1
      FROM role_permissions rp
      WHERE rp.role_id    = su.role_id
        AND rp.permission_id = p.id
        AND rp.store_id   = su.store_id
  );
