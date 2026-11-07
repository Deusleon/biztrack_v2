#!/usr/bin/env node
/**
 * BizTrack — Permission Sync Script
 *
 * Reads the canonical permission list from permissionsList.js and performs
 * an UPSERT into the `permissions` table:
 *   - New entries are INSERTED
 *   - Existing entries have description, module, and display_no UPDATED
 *   - Nothing is deleted (preserves existing role_permissions assignments)
 *
 * Usage:
 *   node DB/seeds/syncPermissions.js
 *
 * Options (env):
 *   DRY_RUN=1   — print what would change without writing to the DB
 */

import pool from '../config/db.js';
import permissions from './permissionsList.js';
const DRY_RUN = process.env.DRY_RUN === "1";

async function syncPermissions() {
  const client = await pool.connect();

  try {
    // ── 1. Load existing permissions from DB ─────────────────────────────────
    const { rows: existing } = await client.query(
      "SELECT name, description, module, submodule, display_no FROM permissions"
    );

    const existingMap = Object.fromEntries(existing.map((p) => [p.name, p]));

    const toInsert = [];
    const toUpdate = [];

    for (const perm of permissions) {
      const db = existingMap[perm.name];

      if (!db) {
        toInsert.push(perm);
      } else {
        // Check if anything changed
        const changed =
          db.description !== perm.description ||
          db.module !== perm.module ||
          db.submodule !== (perm.submodule ?? null) ||
          db.display_no !== perm.display_no;

        if (changed) toUpdate.push(perm);
      }
    }

    // ── 2. Report ────────────────────────────────────────────────────────────
    console.log(`\n── BizTrack Permission Sync ──────────────────────────`);
    console.log(`   Total defined : ${permissions.length}`);
    console.log(`   In database   : ${existing.length}`);
    console.log(`   To INSERT     : ${toInsert.length}`);
    console.log(`   To UPDATE     : ${toUpdate.length}`);
    console.log(`   Unchanged     : ${permissions.length - toInsert.length - toUpdate.length}`);

    if (DRY_RUN) {
      if (toInsert.length > 0) {
        console.log("\n[DRY RUN] Would INSERT:");
        toInsert.forEach((p) => console.log(`   + ${p.name}  (${p.module})`));
      }
      if (toUpdate.length > 0) {
        console.log("\n[DRY RUN] Would UPDATE:");
        toUpdate.forEach((p) => console.log(`   ~ ${p.name}  (${p.module})`));
      }
      console.log("\n── Dry run complete. No changes written. ─────────────\n");
      return;
    }

    await client.query("BEGIN");

    // ── 3. Insert new permissions ────────────────────────────────────────────
    const insertedPermissionIds = [];
    for (const p of toInsert) {
      const result = await client.query(
        `INSERT INTO permissions (name, description, module, submodule, display_no)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [p.name, p.description, p.module, p.submodule ?? null, p.display_no]
      );
      insertedPermissionIds.push(result.rows[0].id);
      console.log(`  ✚ Inserted: ${p.name}`);
    }

    // ── 4. Update changed permissions ────────────────────────────────────────
    for (const p of toUpdate) {
      await client.query(
        `UPDATE permissions
         SET description = $1, module = $2, submodule = $3, display_no = $4
         WHERE name = $5`,
        [p.description, p.module, p.submodule ?? null, p.display_no, p.name]
      );
      console.log(`  ↻ Updated : ${p.name}`);
    }

    // ── 5. Assign new permissions to owner role (store zote) ─────────────────
    if (insertedPermissionIds.length > 0) {
      console.log(`\n  → Assigning ${insertedPermissionIds.length} new permissions to owner roles...`);

      // Pata kila jozi halisi ya (owner role, store) kupitia store_users
      const { rows: ownerRoleStores } = await client.query(
        `SELECT DISTINCT su.role_id, su.store_id
     FROM store_users su
     JOIN roles r ON r.id = su.role_id
     WHERE LOWER(r.name) = 'owner'
       AND su.store_id IS NOT NULL`
      );

      let assignedCount = 0;
      for (const rs of ownerRoleStores) {
        for (const permissionId of insertedPermissionIds) {
          await client.query(
            `INSERT INTO role_permissions (role_id, permission_id, store_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_id, store_id) DO NOTHING`,
            [rs.role_id, permissionId, rs.store_id]
          );
          assignedCount++;
        }
      }
      console.log(
        `  ✓ Assigned ${assignedCount} entries across ${ownerRoleStores.length} (role, store) combination(s)`
      );
    }

    await client.query("COMMIT");
    console.log("\n── Sync complete. ────────────────────────────────────\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n✗ Sync FAILED:", err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

syncPermissions();
