#!/usr/bin/env node
/**
 * BizTrack — Development Seed Script
 *
 * Seeds all tables with realistic sample data for development & testing.
 *
 * Prerequisites (run in order):
 *   1. npm run migrate               — apply all DB migrations
 *   2. npm run permissions:sync      — seed the permissions table
 *   3. node DB/seeds/seed.js         — this script
 *
 * Idempotent: uses ON CONFLICT (id) DO NOTHING — safe to re-run.
 *
 * Default password for ALL seeded users: Password123!
 *
 * ─── Synced with database.sql dump (2026-06-16) ──────────────────────────────
 * Changes vs previous seed:
 *   - U1 (Little Programmer) password hash updated to match live DB
 *   - S4 store name corrected: 'DUKA LANGU' → 'New Shop' (renamed in production)
 *   - store_users updated_at timestamps aligned with live DB
 *   - Customers block updated: live DB has 2 active customers (Apotek User, Deus Leonard)
 *     in addition to the original 6 seed customers
 *   - Product categories expanded: DB has 11 additional categories (Baby Care, Diabetes,
 *     Supplements, Pain Relief, Vitamins, Blood Pressure, Skin Care, Antibiotics,
 *     Medical Supplies, Cough & Cold, Electronics)
 */

'use strict';

import pool from '../config/db.js';
// ─── Fixed UUIDs ─────────────────────────────────────────────────────────────
// Users
const U1 = 'f3428dae-83bd-4693-a6f3-50edae681eda'; // Little Programmer — owner
const U2 = 'dafce4e5-6875-4f5b-b5e3-3f490ab54194'; // Lifen M.
const U3 = 'ed4727a6-f4a3-41f9-ae50-20a00b6b9a64'; // Lifen Mlokole
const U4 = '35411df1-f595-43a6-8f7f-b493517b5c67'; // Deusleo
const U5 = '35eca1b5-e08d-4379-af13-2183c5bc6e32'; // Sample Registered User
const U6 = '42cc9ab7-30f3-4e94-be6f-78d20f56f0ea'; // Socket test
const U7 = 'd8f08a2c-36ac-4234-94bf-7e6757b13dcd'; // Socket test 2

// Stores
const S1 = 'a57fb5ba-edd6-4534-b8af-349ef44ee77d'; // Magomeni Store
const S2 = '6815328f-7ccc-4424-8159-25ca9e9ad295'; // SALES SHOP
const S3 = '6336c1e5-af50-4683-b1b0-67986309a3a8'; // Named
const S4 = '0a2c7e03-3134-4f16-9321-cae46875cd01'; // New Shop (was: DUKA LANGU)

// Roles
const R1 = '4e7cafec-dd26-46a3-b349-1dcba92e2f40'; // Owner  (S1)
const R2 = 'acf0ed14-1056-4898-866e-9d26c81e196e'; // Pending (S1)
const R3 = 'f1dfdb23-5650-4b07-8594-40c11270c900'; // Manager (S1)
const R4 = 'd25c8e0f-bc7f-412f-b4c1-67fa0bb7e70e'; // Cashier (S1)
const R5 = '583ccec1-6f9d-40b2-bdee-900baffea119'; // ADMIN  (S2)

// Customers
const C1 = '98400bfc-f166-4309-be3b-dec64974e6bb'; // mteja mpya
const C2 = '5b7fd672-d40f-43ce-b756-61e66f4325e4'; // Hajulikani
const C3 = 'a7f4d0a8-e986-40f4-8ca5-a0170fea7a2e'; // hayupo
const C4 = '5524fbd6-d1bd-4a72-a247-4a1873d0cffc'; // Mteja wetu
const C5 = 'ff057e0c-b973-406d-90bd-3718c2550173'; // Deus Leonard
const C6 = '52f0bc27-461e-4039-b85b-ce93dedcfa07'; // Little programmer

// Product Categories
const PC1 = '64fa2f27-471f-4bef-a5b3-09620d0b0f74'; // Duka la pili (S4)
const PC2 = '0bbd6591-ff93-4792-a00c-3bd48ab70b45'; // Vinywaji (S1)
const PC3 = '013086d3-fe9b-47a4-9003-dcec50a28703'; // Nafaka (S1)
const PC4 = '99b374ed-3410-4a87-9c30-2219b43534d7'; // Mo cola (S1)
const PC5 = '31c7ed2c-bc75-4dc2-8cc8-258644eb411d'; // Lishe (S1)
// Extended categories (added in production — 2026-05-25)
const PC6  = 'dc01ed34-c819-420a-8d3e-d3c5fde0205d'; // Baby Care (S1)
const PC7  = 'e1f685cc-0ce0-4213-98d9-63d21e9b2da0'; // Diabetes (S1)
const PC8  = 'a41a15a5-b733-40d6-b1f9-08190d935691'; // Supplements (S1)
const PC9  = 'c29481a2-ae4d-4d08-9705-2c3850d1367f'; // Pain Relief (S1)
const PC10 = '5a7e1df4-1d9f-4325-acc8-3b9969c3d97f'; // Vitamins (S1)
const PC11 = 'a5cce512-4f8d-4fa8-bf91-d79b1ee71e0d'; // Blood Pressure (S1)
const PC12 = '2400c7b7-5ad2-4a5d-930a-10bd33a5f34a'; // Skin Care (S1)
const PC13 = '5ba51d99-f1b0-4841-bc3b-a194cca64013'; // Antibiotics (S1)
const PC14 = '8eeb9dd9-43bf-448a-980f-8c59d4a076ae'; // Medical Supplies (S1)
const PC15 = '7ec0c090-8117-41b9-bca7-04de0dfe73ec'; // Cough & Cold (S1)
const PC16 = '2bac8e2e-e59e-4389-b7f2-8ae74d6e918c'; // Electronics (S1)

// Products
const PR1 = 'b5151499-1f0c-478d-a065-7608c470212b'; // w (S1)
const PR2 = '6619bc9c-b8d8-4b83-89ea-14c5d534ccf8'; // Maji ya uhai (S1)
const PR3 = '630bec2c-cfb4-4cc8-80d7-c63053e188c9'; // Bidhaa mpya (S4)
const PR4 = 'fbd52829-cc73-4426-aa84-274438f2b99d'; // Afya Water (S1)
const PR5 = 'e45306e3-7927-4913-8026-f6362101b032'; // Runguu (S1)

// Price Categories
const PRC1 = '7b9499d3-a076-44ce-824d-45fcbfaecd0e'; // Jumla
const PRC2 = '20685944-6fe2-456a-9fde-4b60c372a3f7'; // WholeSale
const PRC3 = '6d549210-c2b9-4bbf-a261-5c12e8ac942f'; // Rejareja

// Suppliers
const SUP1 = '4c7e1cca-faa0-4678-9741-a8acfc606c8f'; // JayRutty Investment
const SUP2 = '9084ecfd-bb37-4e68-9694-a5d454bb2c9a'; // Deus Leonard Mshanga

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
  console.log('  BizTrack Development Seed');
  console.log('══════════════════════════════════════════════════\n');

  await client.query('BEGIN');

  try {

    // ── 1. Users ────────────────────────────────────────────────────────────
    // NOTE: U1 password hash synced from live DB (2026-06-16 dump).
    log('Users (7)');
    await exec(client, `
      INSERT INTO users (id, name, email, password, preferred_language, status, is_verified)
      VALUES
        ('${U1}', 'Little Programmer',      'deusleon7@gmail.com',    '$2b$10$ZBrY.gt8g7YozApJdqDuSulNacTEmsYRQDh3cuAJ0reSACUjr5ve.', 'en', true,  true),
        ('${U2}', 'Lifen M.',               'lifen9803@gmail.com',    '$2b$10$BIu6GDbY3FJSjRFEubKJBOaJ5Yv9PC9mMa.8OKF/sYPYip2KJtkem', 'sw', true,  true),
        ('${U3}', 'Lifen Mlokole',          'lifen980003@gmail.com',  '$2b$10$vszsncOvaqcDmW.1r6s9euqWQEu43rUiZ8u1tguza.5cpimVMHmQG', 'sw', true,  true),
        ('${U4}', 'Deusleo',                'deusleon6@gmail.com',    '$2b$10$Jj/9Mkho.XuAsYA7Y/vh4O/ILEsLBAyjRkAPyHZARVqxEcJ1fcaMu', 'sw', true,  true),
        ('${U5}', 'Sample Registered User', 'lifen1@gmail.com',       '$2b$10$68.kpM4EheTQA7HmSltx/Oorzxzad517afWqnOTdT45drj2NKuOby', 'en', false, true),
        ('${U6}', 'Socket test',            'lifen980031@gmail.com',  '$2b$10$SldEd55zY7C1L/a4OHyvee6OMTGtmZTUXwcxqBXVwDNzb0z1mqsqm', 'en', false, false),
        ('${U7}', 'Socket test',            'lifen98803@gmail.com',   '$2b$10$A6QXB9ohu741nZPh1Me0quExHa/CoSz6O7JMspSzW1QU2Q3WqFsHe', 'en', false, false)
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 2. Stores ───────────────────────────────────────────────────────────
    // NOTE: S4 name changed from 'DUKA LANGU' to 'New Shop' (renamed in live DB).
    log('Stores (4)');
    await exec(client, `
      INSERT INTO stores (id, name, location, owner_id, store_code)
      VALUES
        ('${S1}', 'Magomeni Store', 'Dar es Salaam', '${U1}', 'MGM-002'),
        ('${S2}', 'SALES SHOP',     'Location',      '${U1}', '112233'),
        ('${S3}', 'Named',          'Dar es Salaam', '${U1}', 'KRK-001'),
        ('${S4}', 'New Shop',       'DSM',           '${U4}', 'DL-04')
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 3. Roles ────────────────────────────────────────────────────────────
    log('Roles (5)');
    await exec(client, `
      INSERT INTO roles (id, store_id, name, description)
      VALUES
        ('${R1}', '${S1}', 'Owner',   'Owner of the Store'),
        ('${R2}', '${S1}', 'Pending', 'Awaiting approval or assignment'),
        ('${R3}', '${S1}', 'Manager', 'Store manager'),
        ('${R4}', '${S1}', 'Cashier', 'Cashier Role for sales'),
        ('${R5}', '${S2}', 'Admin',   'Msimamizi mkuu wa duka')
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 4. Store Users ──────────────────────────────────────────────────────
    // NOTE: updated_at timestamps aligned with live DB dump.
    log('Store Users (7)');
    await exec(client, `
      INSERT INTO store_users (id, role_id, status, store_id, user_id, updated_at)
      VALUES
        ('a20c2b76-8baa-4ea9-9f1d-633f6efd1733', '${R2}', false, '${S4}', '${U7}', NULL),
        ('5636f110-4a14-4da0-bd59-b5483a3314b8', '${R3}', true,  '${S4}', '${U3}', '2025-06-26 20:00:45.868159+03'),
        ('e3b4004d-e367-42ca-80a0-e6b598ecd9a4', '${R1}', true,  '${S4}', '${U4}', '2025-05-29 01:45:52.272197+03'),
        ('4bea900e-9dd6-4ed0-99f0-082a57417677', '${R1}', true,  '${S3}', '${U1}', NULL),
        ('ec96d81b-ca06-4ba1-b543-aeba4ede2881', '${R1}', true,  '${S1}', '${U1}', '2026-05-20 15:25:55.569871+03'),
        ('ce56c8f8-df5e-465f-b221-d7640c09621b', '${R5}', true,  '${S2}', '${U1}', '2026-05-20 17:17:51.990105+03'),
        ('b3695822-6812-419c-808e-c7f6485b3ca7', '${R3}', true,  '${S1}', '${U2}', '2026-06-08 12:06:08.506663+03')
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
        phone: '255743169014 | 255768169014',
        address: 'Gongolamboto, Dar es Salaam Tanzania',
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

    // ── 9. Product Categories ──────────────────────────────────────────────
    // NOTE: 11 additional categories (PC6–PC16) synced from live DB (added 2026-05-25/28).
    log('Product Categories (16)');
    await exec(client, `
      INSERT INTO product_categories (id, store_id, name, description)
      VALUES
        ('${PC1}',  '${S4}', 'Duka la pili',   'Cat ya duka la pili'),
        ('${PC2}',  '${S1}', 'Vinywaji',        'Vinywaji baridi na moto'),
        ('${PC3}',  '${S1}', 'Nafaka',          'Nafaka za mazao mbalimbali ya chakula'),
        ('${PC4}',  '${S1}', 'Mo cola......',   'This is the new products'),
        ('${PC5}',  '${S1}', 'Lishe',           'Unga wa lishe kwa ajili ya watoto'),
        ('${PC6}',  '${S1}', 'Baby Care',       NULL),
        ('${PC7}',  '${S1}', 'Diabetes',        NULL),
        ('${PC8}',  '${S1}', 'Supplements',     NULL),
        ('${PC9}',  '${S1}', 'Pain Relief',     NULL),
        ('${PC10}', '${S1}', 'Vitamins',        NULL),
        ('${PC11}', '${S1}', 'Blood Pressure',  NULL),
        ('${PC12}', '${S1}', 'Skin Care',       NULL),
        ('${PC13}', '${S1}', 'Antibiotics',     NULL),
        ('${PC14}', '${S1}', 'Medical Supplies',NULL),
        ('${PC15}', '${S1}', 'Cough & Cold',    NULL),
        ('${PC16}', '${S1}', 'Electronics',     NULL)
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 10. Products ────────────────────────────────────────────────────────
    log('Products (5)');
    await exec(client, `
      INSERT INTO products (id, store_id, category_id, name, description, price, cost_price, image_url, minimum_stock, barcode, unit, status)
      VALUES
        ('${PR1}', '${S1}', '${PC5}', 'w',             NULL,                                                    5999.00, 4500.00, NULL,                                                                                      200.00, 'W-C470212B',    'unit_pc',     'active'),
        ('${PR2}', '${S1}', '${PC2}', 'Maji ya uhai',  'Hakuna maelezo zaidi',                                   600.00,  500.00, 'https://res.cloudinary.com/dptosxac4/image/upload/v1765271760/yz82wv3pu9b3qbdow8to.webp', 500.00, '6970259791018', 'unit_bottle', 'active'),
        ('${PR3}', '${S4}', '${PC1}', 'Bidhaa  mpya',  'Haina kipengele',                                       2500.00, 1000.00, NULL,                                                                                          5.00, '6988188700292', 'unit_box',    'active'),
        ('${PR4}', '${S1}', '${PC5}', 'Afya Water',    NULL,                                                    6000.00, 4000.00, 'https://res.cloudinary.com/dptosxac4/image/upload/v1765548217/njcah28jyj3qnzxxlxvp.jpg',     0.00, 'AFY-38F2B99D',  'unit_pc',     'active'),
        ('${PR5}', '${S1}', '${PC5}', 'Runguu',        'Sample ya bidhaa muhimu zenye initial stock',           9000.00, 7500.00, 'https://res.cloudinary.com/dptosxac4/image/upload/v1765747406/pn0sfa27x7m01jn0rr0x.webp', 200.00, 'RUN-2101B032',  'unit_pc',     'active')
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 11. Price Categories ────────────────────────────────────────────────
    log('Price Categories (3)');
    await exec(client, `
      INSERT INTO price_categories (id, store_id, name, description, is_active)
      VALUES
        ('${PRC1}', '${S1}', 'Jumla',    'Mauzo kwa bei ya jumla',    true),
        ('${PRC2}', '${S1}', 'WholeSale','Wholesale price',            true),
        ('${PRC3}', '${S1}', 'Rejareja', 'Mauzo kwa bei ya rejareja', true)
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 12. Customers ────────────────────────────────────────────────────────
    log('Customers (6)');
    await exec(client, `
      INSERT INTO customers (id, store_id, name, phone, email, address, customer_type, created_by, credit_limit, current_balance, credit_due_days)
      VALUES
        ('${C1}', '${S4}', 'mteja mpya',       '255714141414', NULL,                  NULL, '${PRC1}', '${U4}', 0.00,      0.00, 0),
        ('${C2}', '${S4}', 'Hajulikani',        '255111111111', NULL,                  NULL, '${PRC1}', '${U4}', 0.00,      0.00, 0),
        ('${C3}', '${S1}', 'hayupo',            NULL,           NULL,                  NULL, '${PRC1}', '${U1}', 0.00,  17700.00, 0),
        ('${C4}', '${S1}', 'Mteja wetu',        '255777777777', NULL,                  NULL, '${PRC1}', '${U4}', 0.00, 645540.00, 0),
        ('${C5}', '${S1}', 'Deus Leonard',      '255654930404', 'deusleon7@gmail.com', NULL, '${PRC1}', '${U1}', 0.00,      0.00, 0),
        ('${C6}', '${S1}', 'Little programmer', '255743169014', NULL,                  NULL, '${PRC1}', '${U1}', 0.00, 124484.00, 3)
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 13. Suppliers ───────────────────────────────────────────────────────
    log('Suppliers (2)');
    await exec(client, `
      INSERT INTO suppliers (id, store_id, name, contact_person, email, phone, address, city, country, tin_number, vat_number, payment_terms, notes)
      VALUES
        ('${SUP1}','${S1}','JayRutty Investment',  'Joe Rwegasira',        'jayruttyinv@info.co.tz', '+255743169014', 'P.O. Box 517, Dar es Salaam Tanzania', 'Dar es Salaam', 'Tanzania', '111-222-333', '111-5055', 'Malipo yote yafanyike benki',   'Msambazaji wa jersey original za simba sports club'),
        ('${SUP2}','${S1}','Deus Leonard Mshanga', 'Deus Leonard Mshanga', 'deusleon7@gmail.com',    '+255743169014', 'King''ori - Arusha',                   'Kilimanjaro',   'Tanzania', '111-222-333', '111-5055', 'Hakuna masharti',               'Hakuna maelezo zaidi')
      ON CONFLICT (id) DO NOTHING;
    `);
    ok();

    // ── 14. Role Permissions ─────────────────────────────────────────────────
    //
    // Assigns permissions to each role. Permission UUIDs are resolved at
    // runtime by joining against the permissions table (populated by syncPermissions).
    //
    // Role matrix:
    //   Owner   (R1, S1) — ALL 111 permissions
    //   Manager (R3, S1) — 76 permissions (no deletes on core records, no admin)
    //   Cashier (R4, S1) — 18 permissions (sales + basic inventory view)
    //   Pending (R2, S1) — 0  permissions (awaiting assignment)
    //   Admin   (R5, S2) — 76 permissions (same matrix as Manager)
    //
    log('Role Permissions (resolving from permissions table)');

    const ALL_PERMISSIONS = `SELECT name, id FROM permissions`;

    const ownerPermissions = null; // signals "all"

    const managerPermissions = [
      // Dashboard
      'view_dashboard',
      // Sales
      'create_invoice', 'apply_discount', 'view_pending_invoices', 'manage_pending_invoices',
      'view_sales_records', 'view_sales_returns', 'create_sales_return',
      'view_debits', 'view_customers', 'create_customers', 'update_customers',
      'view_credit_sales', 'manage_credit_sales',
      // Purchases
      'view_purchase_orders', 'create_purchase_orders', 'update_purchase_orders', 'approve_purchase_orders',
      'view_grn', 'create_grn', 'approve_grn',
      'view_supplier_invoices', 'create_supplier_invoices', 'update_supplier_invoices',
      'view_supplier_payments', 'create_supplier_payments',
      'view_supplier_returns', 'create_supplier_returns', 'approve_supplier_returns',
      // Expenses
      'view_expenses', 'create_expenses', 'update_expenses',
      // Inventory
      'view_products', 'create_products', 'update_products', 'export_products_pdf',
      'view_suppliers', 'create_suppliers', 'update_suppliers',
      'view_inventory', 'view_current_stock', 'view_current_stock_value', 'view_stock_value_history',
      'edit_batch', 'export_inventory_pdf',
      'view_price_lists', 'manage_price_list',
      'view_stock_adjustments', 'create_stock_adjustment',
      'view_stock_counts', 'create_stock_count', 'approve_stock_count',
      'view_stock_transfers', 'create_stock_transfer', 'approve_stock_transfer',
      'view_imports_exports', 'import_products', 'import_stock', 'import_prices',
      'export_products', 'export_stock', 'export_prices',
      // Reports
      'view_sales_reports', 'view_inventory_reports', 'view_purchase_reports', 'view_expense_reports', 'view_profit_reports',
      // Categories (view only)
      'view_product_categories', 'view_price_categories',
      // Users (view only)
      'view_users', 'view_roles', 'view_permissions',
      // Stores (view only)
      'view_stores',
      // Settings (view only)
      'view_configurations', 'view_notifications', 'view_appearance', 'view_subscription',
    ];

    const cashierPermissions = [
      'view_dashboard',
      'create_invoice', 'apply_discount',
      'view_pending_invoices', 'manage_pending_invoices',
      'view_sales_records', 'view_sales_returns', 'create_sales_return',
      'view_debits', 'view_customers', 'create_customers',
      'view_credit_sales', 'manage_credit_sales',
      'view_inventory', 'view_current_stock', 'view_price_lists',
      'view_products', 'view_product_categories',
    ];

    // Fetch all permission ids from the permissions table
    const { rows: permRows } = await client.query(
      'SELECT name, id FROM permissions'
    );

    if (permRows.length === 0) {
      console.warn('\n  ⚠️  permissions table is empty — skipping role_permissions.');
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
      const ownerVals = buildValues(R1, S1, ownerNames);
      if (ownerVals) {
        await exec(client, `
          INSERT INTO role_permissions (id, role_id, permission_id, store_id, is_allowed, created_at, updated_at)
          VALUES ${ownerVals}
          ON CONFLICT (role_id, permission_id, store_id) DO NOTHING;
        `);
      }

      // Manager (R3, S1)
      const managerVals = buildValues(R3, S1, managerPermissions);
      if (managerVals) {
        await exec(client, `
          INSERT INTO role_permissions (id, role_id, permission_id, store_id, is_allowed, created_at, updated_at)
          VALUES ${managerVals}
          ON CONFLICT (role_id, permission_id, store_id) DO NOTHING;
        `);
      }

      // Cashier (R4, S1)
      const cashierVals = buildValues(R4, S1, cashierPermissions);
      if (cashierVals) {
        await exec(client, `
          INSERT INTO role_permissions (id, role_id, permission_id, store_id, is_allowed, created_at, updated_at)
          VALUES ${cashierVals}
          ON CONFLICT (role_id, permission_id, store_id) DO NOTHING;
        `);
      }

      // Pending (R2, S1) — intentionally empty, no INSERT needed

      // Admin (R5, S2) — same matrix as Manager but for S2
      const adminVals = buildValues(R5, S2, managerPermissions);
      if (adminVals) {
        await exec(client, `
          INSERT INTO role_permissions (id, role_id, permission_id, store_id, is_allowed, created_at, updated_at)
          VALUES ${adminVals}
          ON CONFLICT (role_id, permission_id, store_id) DO NOTHING;
        `);
      }
    }
    ok();

    await client.query('COMMIT');

    console.log('\n══════════════════════════════════════════════════');
    console.log('  ✅  Seed completed successfully!');
    console.log('══════════════════════════════════════════════════');
    console.log('\n  Login credentials for ALL seeded users:');
    console.log('  ─────────────────────────────────────────────');
    console.log(`  Password  : Password123!`);
    console.log(`  Owner     : deusleon7@gmail.com   (Little Programmer — U1)`);
    console.log(`  Manager   : lifen9803@gmail.com   (Lifen M. — U2, S1)`);
    console.log(`  Manager   : lifen980003@gmail.com (Lifen Mlokole — U3, S4)`);
    console.log(`  Store Owner: deusleon6@gmail.com  (Deusleo — U4, New Shop)`);
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
