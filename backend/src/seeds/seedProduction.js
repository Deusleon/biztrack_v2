#!/usr/bin/env node
/**
 * BizTrack — Production Seed Script
 *
 * Seeds all tables with realistic sample data for initial setup.
 *
 * Prerequisites (run in order):
 *   1. npm run migrate               — apply all DB migrations
 *   2. npm run permissions:sync      — seed the permissions table
 *   3. node DB/seeds/seedProduction.js         — this script
 *
 * Idempotent: uses ON CONFLICT (id) DO NOTHING — safe to re-run.
 *
 * Default password for ALL seeded users: BizTrack#admin!
 *
 */

'use strict';

import pool from '../config/db.js';
// ─── Fixed UUIDs ─────────────────────────────────────────────────────────────
// Users
const U1 = 'f3428dae-83bd-4693-a6f3-50edae681eda'; // Dev Account
const U2 = 'dafce4e5-6875-4f5b-b5e3-3f490ab54194'; // BizTrack System — owner.

// Stores
const S1 = 'a57fb5ba-edd6-4534-b8af-349ef44ee77d'; // Default Store

// Roles
const R1 = 'f1dfdb23-5650-4b07-8594-40c11270c900'; // Dev (S1)
const R2 = '4e7cafec-dd26-46a3-b349-1dcba92e2f40'; // Owner  (S1)
const R3 = 'acf0ed14-1056-4898-866e-9d26c81e196e'; // Pending (S1)

// Customers
const C1 = '98400bfc-f166-4309-be3b-dec64974e6bb'; // Walk-in Customer

const PACKAGE_OPTIONS_JSON = '{\"operations\":{\"allowVAT\":false,\"showUnit\":true,\"showCurrency\":false,\"allowDiscount\":false,\"defaultTaxRate\":\"0\",\"isPrimaryStore\":false,\"makePriceFixed\":true,\"pastDatesSales\":false,\"receiptPreview\":true,\"allowExpireDate\":false,\"defaultCurrency\":\"Tsh\",\"defaultLanguage\":\"en\",\"showDateWithTime\":true,\"defaultDateFormat\":\"1\",\"defaultTimeFormat\":\"12\",\"multiPriceSupport\":false,\"showLogoOnReceipt\":true,\"useBatchWisePrice\":true,\"allowNegativeStock\":false,\"creditSalesSupport\":false,\"defaultReceiptSize\":\"A5\",\"pastDatesPurchases\":false,\"customerCreditLimit\":false,\"defaultCustomerType\":\"street\",\"defaultDiscountMode\":\"unit\",\"defaultDiscountType\":\"amount\",\"showChangeOnReceipt\":true,\"defaultCreditDueDays\":\"0\",\"defaultDecimalPlaces\":\"2\",\"defaultPaymentMethod\":\"cash\",\"defaultPriceCategory\":\"\",\"multiLanguageSupport\":false,\"enableReceiptPrinting\":true,\"defaultReportDateRange\":\"today\",\"multiplePaymentMethods\":false,\"defaultCurrencyPosition\":\"before\",\"fullCustomerRegistration\":false},\"businessHours\":{\"end\":\"20:00\",\"start\":\"07:00\"},\"systemOptions\":[{\"id\":\"localization\",\"icon\":\"Globe\",\"title\":\"system_defaults\",\"fields\":[{\"key\":\"defaultLanguage\",\"type\":\"select\",\"label\":\"default_language\",\"options\":[{\"label\":\"english\",\"value\":\"en\"},{\"label\":\"swahili\",\"value\":\"sw\"}]},{\"key\":\"defaultCurrency\",\"type\":\"select\",\"label\":\"default_currency\",\"options\":[{\"label\":\"tanzanian_shilling_tsh\",\"value\":\"Tsh\"},{\"label\":\"us_dollar_usd\",\"value\":\"$\"},{\"label\":\"euro_eur\",\"value\":\"€\"}]},{\"key\":\"defaultCurrencyPosition\",\"type\":\"select\",\"label\":\"currency_position\",\"options\":[{\"label\":\"before_amount\",\"value\":\"before\"},{\"label\":\"after_amount\",\"value\":\"after\"}]},{\"key\":\"defaultDecimalPlaces\",\"type\":\"select\",\"label\":\"decimal_places\",\"options\":[{\"label\":\"0_no_decimals\",\"value\":\"0\"},{\"label\":\"1_decimal_place\",\"value\":\"1\"},{\"label\":\"2_decimal_places\",\"value\":\"2\"},{\"label\":\"3_decimal_places\",\"value\":\"3\"},{\"label\":\"4_decimal_places\",\"value\":\"4\"}]},{\"key\":\"defaultTaxRate\",\"max\":100,\"min\":0,\"type\":\"percentage\",\"label\":\"default_tax_rate\"},{\"key\":\"defaultPaymentMethod\",\"type\":\"select\",\"label\":\"default_payment_method\",\"options\":[{\"label\":\"cash\",\"value\":\"cash\"},{\"label\":\"mobile_money\",\"value\":\"mobile\"},{\"label\":\"bank_transfer\",\"value\":\"bank\"}]},{\"key\":\"defaultDiscountType\",\"type\":\"select\",\"label\":\"default_discount_type\",\"options\":[{\"label\":\"amount\",\"value\":\"amount\"},{\"label\":\"percentage\",\"value\":\"percentage\"}]},{\"key\":\"defaultDiscountMode\",\"type\":\"select\",\"label\":\"default_discount_mode\",\"options\":[{\"label\":\"per_unit\",\"value\":\"unit\"},{\"label\":\"volume\",\"value\":\"volume\"}]},{\"key\":\"defaultCustomerType\",\"type\":\"select\",\"label\":\"default_customer_type\",\"options\":[{\"label\":\"walk_in_customer\",\"value\":\"street\"},{\"label\":\"registered_customer\",\"value\":\"registered\"}]},{\"key\":\"defaultCreditDueDays\",\"max\":90,\"min\":1,\"type\":\"number\",\"label\":\"default_credit_due_days\"},{\"key\":\"defaultReceiptSize\",\"type\":\"select\",\"label\":\"receipt_size\",\"options\":[{\"label\":\"size_58mm\",\"value\":\"58mm\"},{\"label\":\"size_80mm\",\"value\":\"80mm\"},{\"label\":\"size_a5\",\"value\":\"A5\"},{\"label\":\"size_a4\",\"value\":\"A4\"}]},{\"key\":\"defaultReportDateRange\",\"type\":\"select\",\"label\":\"report_date_range\",\"options\":[{\"label\":\"today\",\"value\":\"today\"},{\"label\":\"yesterday\",\"value\":\"yesterday\"},{\"label\":\"last_7_days\",\"value\":\"last7days\"},{\"label\":\"this_month\",\"value\":\"thismonth\"},{\"label\":\"last_month\",\"value\":\"lastmonth\"},{\"label\":\"this_year\",\"value\":\"thisyear\"},{\"label\":\"custom_range\",\"value\":\"custom\"}]},{\"key\":\"defaultDateFormat\",\"type\":\"select\",\"label\":\"date_format\",\"options\":[{\"label\":\"dd_mm_yyyy\",\"value\":\"1\"},{\"label\":\"mm_dd_yyyy\",\"value\":\"2\"},{\"label\":\"yyyy_mm_dd\",\"value\":\"3\"},{\"label\":\"dd_mmm_yyyy\",\"value\":\"4\"},{\"label\":\"dd_mmmm_yyyy\",\"value\":\"5\"}]},{\"key\":\"defaultTimeFormat\",\"type\":\"select\",\"label\":\"default_time_format\",\"options\":[{\"label\":\"12_hrs\",\"value\":\"12\"},{\"label\":\"24_hrs\",\"value\":\"24\"}]}]},{\"id\":\"operations\",\"icon\":\"Warehouse\",\"title\":\"Operations Settings\",\"fields\":[{\"key\":\"multiStoreSupport\",\"type\":\"checkbox\",\"label\":\"multi_store_support\"},{\"key\":\"multiLanguageSupport\",\"type\":\"checkbox\",\"label\":\"multi_language_support\"},{\"key\":\"creditSalesSupport\",\"type\":\"checkbox\",\"label\":\"credit_sales_support\"},{\"key\":\"multiplePaymentMethods\",\"type\":\"checkbox\",\"label\":\"multiple_payment_methods\"},{\"key\":\"allowDiscount\",\"type\":\"checkbox\",\"label\":\"allow_discount\"},{\"key\":\"allowVAT\",\"type\":\"checkbox\",\"label\":\"allow_vat\"},{\"key\":\"multiPriceSupport\",\"type\":\"checkbox\",\"label\":\"multi_price_support\"},{\"key\":\"showCurrency\",\"type\":\"checkbox\",\"label\":\"show_currency\"},{\"key\":\"makePriceFixed\",\"type\":\"checkbox\",\"label\":\"make_price_fixed\"},{\"key\":\"useBatchWisePrice\",\"type\":\"checkbox\",\"label\":\"use_batchwise_price\"},{\"key\":\"pastDatesSales\",\"type\":\"checkbox\",\"label\":\"record_sales_past_dates\"},{\"key\":\"pastDatesPurchases\",\"type\":\"checkbox\",\"label\":\"record_purchases_past_dates\"},{\"key\":\"enableReceiptPrinting\",\"type\":\"checkbox\",\"label\":\"enable_receipt_printing\"},{\"key\":\"receiptPreview\",\"type\":\"checkbox\",\"label\":\"receipt_preview\"},{\"key\":\"showLogoOnReceipt\",\"type\":\"checkbox\",\"label\":\"show_logo_on_receipt\"},{\"key\":\"allowExpireDate\",\"type\":\"checkbox\",\"label\":\"allow_expire_date\"},{\"key\":\"allowNegativeStock\",\"type\":\"checkbox\",\"label\":\"allow_negative_stock\"},{\"key\":\"showChangeOnReceipt\",\"type\":\"checkbox\",\"label\":\"show_change_on_receipt\"},{\"key\":\"fullCustomerRegistration\",\"type\":\"checkbox\",\"label\":\"full_customer_registration\"},{\"key\":\"customerCreditLimit\",\"type\":\"checkbox\",\"label\":\"customer_credit_limit\"},{\"key\":\"showDateWithTime\",\"type\":\"checkbox\",\"label\":\"show_date_with_time\"},{\"key\":\"showUnit\",\"type\":\"checkbox\",\"label\":\"show_unit\"},{\"key\":\"interStoreTransfer\",\"type\":\"checkbox\",\"label\":\"inter_store_transfer\"}]}]}';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const log = (msg) => process.stdout.write(`  → ${msg} ... `);
const ok  = ()    => console.log('✓');

async function exec(client, sql) {
  await client.query(sql);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  const client = await pool.connect();

  console.log('\n══════════════════════════════════════════════════');
  console.log('  BizTrack Production Seed');
  console.log('══════════════════════════════════════════════════\n');

  await client.query('BEGIN');

  try {

    // ── 1. Users ────────────────────────────────────────────────────────────
    // NOTE: U1 password hash synced from live DB (2026-06-16 dump).
    log('Users (2)');
    await exec(client, `
      INSERT INTO users (id, name, email, password, preferred_language, status, is_verified)
      VALUES
        ('${U1}', 'Dev Account',      'deusleon7@gmail.com',    '$2b$10$.zh6pmx6clif/z2EK6LT5.K0qNkR3hCOtPouR9pKQbpFcB7YADROC', 'en', true,  true),
        ('${U2}', 'BizTrack System',        'info@biztrack.co.tz',    '$2b$10$.zh6pmx6clif/z2EK6LT5.K0qNkR3hCOtPouR9pKQbpFcB7YADROC', 'en', true,  true)
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 2. Stores ───────────────────────────────────────────────────────────
    // NOTE: S4 name changed from 'DUKA LANGU' to 'New Shop' (renamed in live DB).
    log('Stores (1)');
    await exec(client, `
      INSERT INTO stores (id, name, location, owner_id, store_code)
      VALUES
        ('${S1}', 'Default Store', 'Dar es Salaam', '${U1}', 'DEF-01')
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 3. Roles ────────────────────────────────────────────────────────────
    log('Roles (3)');
    await exec(client, `
      INSERT INTO roles (id, store_id, name, description)
      VALUES
        ('${R1}', '${S1}', 'Dev',   'Developer role with full permissions for testing and development purposes'),
        ('${R2}', '${S1}', 'Owner',   'Owner of the Store with full permissions'),
        ('${R3}', '${S1}', 'Pending', 'Awaiting approval or assignment of role & permissions')
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 4. Store Users ──────────────────────────────────────────────────────
    // NOTE: updated_at timestamps aligned with live DB dump.
    log('Store Users (2)');
    await exec(client, `
      INSERT INTO store_users (id, role_id, status, store_id, user_id, updated_at)
      VALUES
        ('ec96d81b-ca06-4ba1-b543-aeba4ede2881', '${R1}', true,  '${S1}', '${U1}', '2026-05-20 15:25:55.569871+03'),
        ('ce56c8f8-df5e-465f-b221-d7640c09621b', '${R2}', true,  '${S1}', '${U2}', '2026-05-20 17:17:51.990105+03')
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 5. Configurations ───────────────────────────────────────────────────
    log('Configurations (1)');
    await exec(client, `
      INSERT INTO configurations (id, name, value)
      VALUES
        ('ca61f798-bfd7-42c3-995e-99f2ede60ecb', 'default_store', '6145a267-0dad-4c15-bc6e-81e3e48e7863')
      ON CONFLICT (name) DO NOTHING;
    `);
    ok();

    // ── 6. Package Settings ─────────────────────────────────────────────────
    log('Package Settings (1)');
    await exec(client, `
      INSERT INTO package_settings (id, package_options)
      VALUES ('eb102d97-7fb1-43c3-b666-334621d393b6', '${PACKAGE_OPTIONS_JSON.replace(/'/g, "''")}')
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 7. System Settings ──────────────────────────────────────────────────
    log('System Settings (1)');
    const SYSTEM_SETTINGS_JSON = JSON.stringify({
      businessInfo: {
        logo: null,
        email: 'info@biztrack.co.tz',
        phone: '255743169014 | 255620854145',
        address: 'Dar es Salaam Tanzania',
        website: 'www.biztrack.co.tz',
        tinNumber: '111-222-333',
        vrnNumber: '11-222-333',
        phoneNumber: '',
        businessLogo: null,
        businessName: 'BizTrack Pro',
        emailAddress: '',
        receiptFooterText: 'Thank you for your business!',
      },
      systemOptions: [
        {
          id: 'businessInfo', icon: 'Building2', title: 'business_information',
          fields: [
            { key: 'logo',              type: 'image', label: 'business_logo' },
            { key: 'businessName',      type: 'input', label: 'business_name', required: true, placeholder: 'enter_business_name' },
            { key: 'tinNumber',         type: 'input', label: 'tin_number',    placeholder: 'enter_TIN_number' },
            { key: 'vrnNumber',         type: 'input', label: 'vrn_number',    placeholder: 'enter_VRN_number' },
            { key: 'address',           type: 'input', label: 'address',       placeholder: 'enter_company_address' },
            { key: 'phone',             type: 'input', label: 'phone_number',  placeholder: 'enter_phone_number' },
            { key: 'email',             type: 'input', label: 'email_address', type_attr: 'email', placeholder: 'enter_email_address' },
            { key: 'website',           type: 'input', label: 'website',       placeholder: 'enter_website_URL' },
            { key: 'receiptFooterText', type: 'input', label: 'receipt_footer_text', placeholder: 'enter_receipt_footer_text' },
          ],
        },
      ],
      systemDefaults: {
        defaultStore: S1,
        multiStoreSupport: true,
        interStoreTransfer: false,
      },
    });
    await exec(client, `
      INSERT INTO system_settings (id, settings)
      VALUES ('b38c44e6-83e0-49a5-a737-fce8c43d482e', '${SYSTEM_SETTINGS_JSON.replace(/'/g, "''")}')
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 8. Store Settings ───────────────────────────────────────────────────
    log('Store Settings (3)');
    const S1_SETTINGS = '{\"operations\":{\"allowVAT\":true,\"showUnit\":false,\"showCurrency\":false,\"allowDiscount\":true,\"defaultTaxRate\":18,\"isPrimaryStore\":true,\"makePriceFixed\":false,\"pastDatesSales\":false,\"receiptPreview\":true,\"allowExpireDate\":true,\"defaultCurrency\":\"Tsh\",\"defaultLanguage\":\"sw\",\"showDateWithTime\":true,\"defaultDateFormat\":\"4\",\"defaultTimeFormat\":\"24\",\"multiPriceSupport\":true,\"showLogoOnReceipt\":true,\"useBatchWisePrice\":true,\"allowNegativeStock\":false,\"creditSalesSupport\":true,\"defaultReceiptSize\":\"A5\",\"pastDatesPurchases\":true,\"customerCreditLimit\":false,\"defaultCustomerType\":\"street\",\"defaultDiscountMode\":\"volume\",\"defaultDiscountType\":\"percentage\",\"showChangeOnReceipt\":true,\"defaultCreditDueDays\":21,\"defaultDecimalPlaces\":\"2\",\"defaultPaymentMethod\":\"bank\",\"defaultPriceCategory\":\"20685944-6fe2-456a-9fde-4b60c372a3f7\",\"multiLanguageSupport\":true,\"enableReceiptPrinting\":true,\"defaultReportDateRange\":\"thismonth\",\"multiplePaymentMethods\":false,\"defaultCurrencyPosition\":\"before\",\"fullCustomerRegistration\":false},\"businessHours\":{\"end\":\"20:00\",\"start\":\"07:00\"},\"systemOptions\":' + PACKAGE_OPTIONS_JSON.slice(PACKAGE_OPTIONS_JSON.indexOf(',\"systemOptions\":') + 17, -1) + '}';
    const OTHER_STORE_SETTINGS = PACKAGE_OPTIONS_JSON;
    await exec(client, `
      INSERT INTO store_settings (id, store_id, settings)
      VALUES
        ('8339fd31-e296-4567-b809-d59b7dfc035e', '${S1}', '${S1_SETTINGS.replace(/'/g, "''")}'),
        ('87840d8d-e910-4618-b298-1a09a4d3379f', '${S2}', '${OTHER_STORE_SETTINGS.replace(/'/g, "''")}'),
        ('32d1b9ca-e1de-4ed1-881a-6e9357474e45', '${S3}', '${OTHER_STORE_SETTINGS.replace(/'/g, "''")}')
      ON CONFLICT (store_id) DO NOTHING;
    `);
    ok();

    // ── 9. Customers ────────────────────────────────────────────────────────
    log('Customers (6)');
    await exec(client, `
      INSERT INTO customers (id, store_id, name, phone, email, address, customer_type, created_by, credit_limit, current_balance, credit_due_days)
      VALUES
        ('${C1}', '${S1}', 'Walk-In Customer',    NULL,    NULL,   NULL,  NULL, '${U2}', 0.00, 0.00, 0)
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    log('Role Permissions (resolving from permissions table)');

    const ALL_PERMISSIONS = `SELECT name, id FROM permissions`;

    const ownerPermissions = null; // signals "all"

    // Fetch all permission ids from the permissions table
    const { rows: permRows } = await client.query(
      'SELECT name, id FROM permissions'
    );

    if (permRows.length === 0) {
      console.warn('\n   permissions table is empty — skipping role_permissions.');
      console.warn('     Run `npm run permissions:sync` first, then re-seed.');
    } else {
      const permMap = Object.fromEntries(permRows.map(r => [r.name, r.id]));

      // Helper: build VALUES rows for a role + permission list + store
      const buildValues = (roleId, storeId, permList) =>
        permList
          .filter(name => permMap[name])
          .map(name =>
            `(gen_random_uuid(), '${roleId}', '${permMap[name]}', '${storeId}', true, NOW(), NOW())`
          )
          .join(',\n        ');

      // Owner (R1, S1) — all permissions
      const ownerNames = permRows.map(r => r.name);
      const devVals = buildValues(R1, S1, ownerNames);
      const ownerVals = buildValues(R2, S1, ownerNames);
      if (devVals) {
        await exec(client, `
          INSERT INTO role_permissions (id, role_id, permission_id, store_id, is_allowed, created_at, updated_at)
          VALUES ${devVals}
          ON CONFLICT (role_id, permission_id, store_id) DO NOTHING;
        `);
      }
      
      if (ownerVals) {
        await exec(client, `
          INSERT INTO role_permissions (id, role_id, permission_id, store_id, is_allowed, created_at, updated_at)
          VALUES ${ownerVals}
          ON CONFLICT (role_id, permission_id, store_id) DO NOTHING;
        `);
      }

      // Pending (R2, S1) — intentionally empty, no INSERT needed
    }
    ok();

    await client.query('COMMIT');

    console.log('\n══════════════════════════════════════════════════');
    console.log('  ✅  Seed completed successfully!');
    console.log('══════════════════════════════════════════════════');
    console.log('\n  Login credentials for seeded user:');
    console.log('  ─────────────────────────────────────────────');
    console.log(`  Password  : BizTrack#admin!`);
    console.log(`  Owner     : info@biztrack.co.tz   (BizTrack System)`);
    console.log('══════════════════════════════════════════════════\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌  Seed failed — rolled back.\n');
    console.error(err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
