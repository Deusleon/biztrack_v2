import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { classifyIntent } from '../src/services/ai/assistant/Intent.service.js';
import { QUESTIONS, gradeQuestion } from '../src/services/ai/assistant/questions.js';
import {
  actionsFor, briefAction, compactVerified, composeBrief, fallbackAnswer, figuresAnswer, money, sourcesFor,
} from '../src/services/ai/assistant/present.js';
import { toGeminiSchema } from '../src/services/ai/providers/geminiSchema.js';
import { addDays, businessToday, periodFromMessage } from '../src/services/ai/assistant/periods.js';
import { briefIsDue } from '../src/services/ai/morningBrief.service.js';

const format = { currency: 'Tsh', decimals: 0 };

test('every sample question selects the verified figures it should', () => {
  assert.ok(QUESTIONS.length >= 30, `expected at least 30 questions, got ${QUESTIONS.length}`);
  const failed = QUESTIONS.map((question) => gradeQuestion(classifyIntent, question)).filter((row) => !row.pass);
  assert.deepEqual(failed, [], failed.map((row) => `${row.id}: expected ${row.expected.join(',')} got ${(row.actual || []).join(',')}`).join('\n'));
});

test('today’s update is answered from the store, and a greeting is not', () => {
  const update = classifyIntent('What is the updates for today?');
  assert.equal(update.clarify, undefined);
  assert.ok(update.tools.includes('getSalesSummary'));
  assert.ok(update.tools.includes('getPurchaseSummary'));
  const items = classifyIntent('What was the items in each purchase order?');
  assert.deepEqual(items.tools, ['getPurchaseSummary']);
  const hello = classifyIntent('Hello there');
  assert.equal(hello.clarify, true);
  assert.deepEqual(hello.tools, []);
});

test('a question that is not about the store is not answered with sales figures', () => {
  const hello = classifyIntent('Hello there');
  assert.equal(hello.clarify, true);
  assert.deepEqual(hello.tools, []);
  const overview = classifyIntent('How is the business?');
  assert.equal(overview.clarify, undefined);
  assert.ok(overview.tools.includes('getSalesSummary'));
  assert.ok(overview.tools.includes('getProfitAnalysis'));
});

test('a follow-up about the same figures is reused, and a new period is fetched', () => {
  const why = classifyIntent('Why?', { lastTools: ['getProfitAnalysis'] });
  assert.equal(why.reuseFigures, true);
  assert.deepEqual(why.tools, ['getProfitAnalysis']);
  const later = classifyIntent('And last month?', { lastTools: ['getSalesSummary'] });
  assert.equal(later.reuseFigures, false);
  assert.deepEqual(later.tools, ['getSalesForPeriod']);
  assert.equal(later.period.kind, 'last_month');
});

test('yesterday is the day before today in the business calendar', () => {
  const today = businessToday(new Date('2026-03-15T00:30:00Z'));
  const yesterday = periodFromMessage('How were sales yesterday?', today);
  assert.equal(yesterday.from, addDays(today, -1));
  assert.equal(yesterday.to, yesterday.from);
  const month = periodFromMessage('na mwezi uliopita', '2026-03-15');
  assert.equal(month.from, '2026-02-01');
  assert.equal(month.to, '2026-02-28');
});

test('a fallback answer shows the verified money and hides tool names', () => {
  const results = {
    getSalesSummary: {
      period: { type: 'today', date: '2026-11-19' },
      sales: { netSales: 120000, salesCount: 14 },
    },
  };
  const text = fallbackAnswer('en', results, format);
  assert.match(text, /Tsh 120,000/);
  assert.match(text, /14 sales/);
  assert.match(text, /19\/11\/2026|Period:/);
  assert.match(text, /provider/i);
  assert.equal(text.includes('getSalesSummary'), false);
  assert.match(figuresAnswer('sw', results, format), /Tsh 120,000/);
});

test('suggested steps open a page and do not save anything', () => {
  const actions = actionsFor({
    getLowStockProducts: { products: [{ id: 'p1', name: 'Sugar', quantity: 1 }] },
    getCustomerDebts: { topDebtors: [{ name: 'Asha', phone: '255700000000', balance: 50000 }] },
  }, 'en', format);
  assert.equal(actions.length, 2);
  for (const action of actions) {
    assert.equal(action.to.startsWith('/'), true);
    assert.equal(action.save, undefined);
    assert.equal(action.mutate, undefined);
    assert.equal(typeof action.draft, 'object');
  }
  assert.equal(actions[0].to, '/purchases/orders/new');
  assert.equal(actions[0].draft.products[0].id, 'p1');
  assert.equal(actions[1].to, '/messaging/recent');
  assert.match(actions[1].draft.message, /Tsh 50,000/);
});

test('sources are page links, not tool ids', () => {
  const sources = sourcesFor(['getSalesSummary', 'getProfitAnalysis'], 'sw');
  assert.deepEqual(sources.map((source) => source.label), ['Mauzo', 'Faida']);
  assert.equal(sources.every((source) => source.to.startsWith('/') && source.verified === true), true);
  assert.equal(JSON.stringify(sources).includes('getSalesSummary'), false);
});

test('the morning brief names yesterday, the figures, and one next step', () => {
  const brief = composeBrief('en', format, {
    date: '2026-11-19',
    sales: { net: 80000, count: 9 },
    profit: 25000,
    lowStock: ['Sugar'],
    slow: ['Flour'],
    debts: [{ name: 'Asha', balance: 10000 }],
  });
  assert.match(brief.text, /Yesterday, 19\/11\/2026/);
  assert.match(brief.text, /Tsh 80,000/);
  assert.match(brief.text, /Tsh 25,000/);
  assert.match(brief.text, /Sugar/);
  assert.match(brief.text, /Flour/);
  assert.match(brief.text, /Asha/);
  assert.match(brief.text, /Do this today: Prepare a purchase order/);
  const sw = composeBrief('sw', format, { date: '2026-11-19', sales: { net: 1, count: 1 } });
  assert.match(sw.text, /Jana/);
  assert.match(sw.text, /Ifanye leo/);
});

test('saved figures stay small enough to keep with the conversation', () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({ name: `Item ${index}` }));
  const compact = compactVerified({ getTopProducts: { products: rows, sales: { netSales: 5 } } });
  assert.equal(compact.getTopProducts.products.length, 8);
  assert.equal(compact.getTopProducts.sales.netSales, 5);
});

test('store comparison only reads stores the person belongs to', () => {
  const source = readFileSync(new URL('../src/services/ai/tools/getStoreComparison.js', import.meta.url), 'utf8');
  assert.match(source, /su\.user_id/);
  assert.match(source, /su\.status = true/);
  assert.equal(source.includes('FROM stores s'), false);
});

test('money follows the store currency and decimal places', () => {
  assert.equal(money(12000.5, { currency: 'Tsh', decimals: 2 }), 'Tsh 12,000.50');
  assert.equal(money(12000.5, { currency: 'Tsh', decimals: 0 }), 'Tsh 12,001');
});

test('Gemini function schemas omit fields the API rejects', () => {
  const schema = toGeminiSchema({
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 20, description: 'How many' },
    },
    required: ['limit'],
    additionalProperties: false,
  });
  assert.equal(schema.additionalProperties, undefined);
  assert.equal(schema.properties.limit.minimum, undefined);
  assert.equal(schema.properties.limit.maximum, undefined);
  assert.equal(schema.properties.limit.description, 'How many');
  assert.deepEqual(schema.required, ['limit']);
});

test('prepare a purchase order opens the order page with the short products and does not save', () => {
  const prepared = classifyIntent('Prepare a purchase order');
  assert.deepEqual(prepared.tools, ['getLowStockProducts']);
  const action = briefAction({
    lowStock: [{ id: 'p1', name: 'Sugar', quantity: 1, minimumStock: 6 }],
  }, 'en');
  assert.equal(action.to, '/purchases/orders/new');
  assert.equal(action.draft.kind, 'purchase');
  assert.equal(action.draft.products[0].quantity, 5);
  assert.equal(action.save, undefined);
});

test('the morning send waits until the chosen time', () => {
  const early = briefIsDue(new Date('2026-11-20T03:00:00Z'), '07:00');
  assert.equal(early.due, false);
  const later = briefIsDue(new Date('2026-11-20T06:30:00Z'), '07:00');
  assert.equal(later.due, true);
  assert.equal(later.date, '2026-11-20');
});
