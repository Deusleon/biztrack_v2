// Subscription and support. No payment is ever made (ClickPesa is unreachable here and must not be called by tests); what matters:
// plans/status/history are read correctly, only the owner may pay, and — most important — a FORGED payment notice cannot
// activate a subscription (the webhook is public). Support tickets: sending, following, and the staff-only help desk.
import { createRequire } from 'node:module';
import { ok, svc, signIn, finish } from './harness.mjs';
const require = createRequire(import.meta.url);
const pg = require('../../backend/node_modules/pg');
const { default: axios } = await import('../../frontend/node_modules/axios/index.js');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { subscriptionService: Sub, supportService: Sup } = svc;
const { store } = await signIn();
const base = process.env.API_URL; const ownerToken = localStorage.getItem('accessToken');
const raw = (token, m, p, d, params) => axios({ method: m, url: base + p, headers: { Authorization: `Bearer ${token}`, 'X-Store-ID': store.id }, data: d, params, validateStatus: () => true });
const staff = process.env.SUPPORT_ADMIN_EMAILS || process.env.DEVELOPER_EMAIL;

// ── plans, status, history ──────────────────────────────────────────────────────────────────────
const plans = await Sub.plans(); ok('plans: code, name, monthly and annual price, limits', plans.length >= 2 && plans.every((p) => p.code && p.name && Number(p.monthly_amount) > 0 && Number(p.annual_amount) > 0 && p.metadata), plans.map((p) => `${p.code} ${p.monthly_amount}`).join(', '));
const me = await Sub.me(); ok('my subscription: plan, cycle, start, end and grace', !!me && me.plan_code && me.current_cycle && me.ends_at && me.grace_ends_at && new Date(me.grace_ends_at) >= new Date(me.ends_at), `${me?.plan_name} until ${me?.ends_at?.slice(0, 10)}`);
ok('payment history answers', Array.isArray(await Sub.history()));
for (const [name, body] of [['no plan', {}], ['no phone', { planCode: plans[0].code, billingCycle: 'monthly', customerName: 'x', customerEmail: 'x@x.com' }]]) { try { await Sub.checkout(body); ok(`checkout refused: ${name}`, false); } catch (e) { ok(`checkout refused: ${name}`, e.status === 400, e.message); } }
try { await Sub.checkout({ planCode: 'NOPE', billingCycle: 'monthly', phoneNumber: '255712345678', customerName: 'x', customerEmail: 'x@x.com' }); ok('checkout refused: unknown plan', false); } catch (e) { ok('checkout refused: unknown plan', e.status === 404, e.message); }

// ── only the owner pays (a cashier has no view_subscription) ────────────────────────────────────
const cashierLogin = await axios.post(`${base}/auth/login`, { email: 'zz.cashier@test.com', password: 'Cash1234!' }, { validateStatus: () => true });
if (cashierLogin.status === 200) {
  const sw = await axios.post(`${base}/auth/switch-store`, { storeId: store.id }, { headers: { Authorization: `Bearer ${cashierLogin.data.token}` }, validateStatus: () => true });
  const ct = sw.data.token || cashierLogin.data.token;
  const c = await raw(ct, 'post', '/subscriptions/checkout', { planCode: plans[0].code, billingCycle: 'monthly', phoneNumber: '255712345678' }); const v = await raw(ct, 'post', '/subscriptions/verify/00000000-0000-0000-0000-000000000001');
  ok('a cashier can see the plans but cannot pay or verify', (await raw(ct, 'get', '/subscriptions/plans')).status === 200 && c.status === 403 && v.status === 403, `plans 200, checkout ${c.status}, verify ${v.status}`);
}

// ── a forged payment notice must not give a free subscription ───────────────────────────────────
const acct = (await pool.query(`SELECT account_id, id AS sub_id, plan_id, ends_at FROM store_subscriptions WHERE account_id = (SELECT account_id FROM store_subscriptions WHERE status = 'active' AND account_id::text IN (SELECT owner_id::text FROM stores WHERE id = $1) LIMIT 1) LIMIT 1`, [store.id])).rows[0] || (await pool.query(`SELECT account_id, id AS sub_id, plan_id, ends_at FROM store_subscriptions LIMIT 1`)).rows[0];
const reqId = `ZZ-REQ-${Date.now()}`;
const tx = (await pool.query(`INSERT INTO subscription_transactions (account_id, store_id, subscription_id, plan_id, provider, billing_cycle, amount, currency, status, request_id, provider_reference) VALUES ($1, $2, $3, $4, 'clickpesa', 'monthly', 35000, 'TZS', 'pending', $5, $5) RETURNING id`, [acct.account_id, store.id, acct.sub_id, acct.plan_id, reqId])).rows[0];
const endsBefore = (await pool.query(`SELECT ends_at FROM store_subscriptions WHERE id = $1`, [acct.sub_id])).rows[0].ends_at;
const forged = await axios.post(`${base}/subscriptions/webhooks/clickpesa`, { event: 'PAYMENT RECEIVED', data: { id: `ZZ-EVT-${Date.now()}`, status: 'SUCCESS', orderReference: tx.id, channel: 'TIGO-PESA' } }, { validateStatus: () => true });
const after = (await pool.query(`SELECT status, paid_at FROM subscription_transactions WHERE id = $1`, [tx.id])).rows[0];
const endsAfter = (await pool.query(`SELECT ends_at FROM store_subscriptions WHERE id = $1`, [acct.sub_id])).rows[0].ends_at;
ok('a forged "payment received" notice does NOT mark the payment paid or extend the subscription', after.status !== 'paid' && !after.paid_at && String(endsAfter) === String(endsBefore), `webhook HTTP ${forged.status}; transaction ${after.status}`);
const forgedByRequestId = await axios.post(`${base}/subscriptions/webhooks/clickpesa`, { event: 'PAYMENT RECEIVED', data: { id: `ZZ-EVT2-${Date.now()}`, status: 'SUCCESS', orderReference: reqId } }, { validateStatus: () => true });
ok('…also when it names the payment by its request id', (await pool.query(`SELECT status FROM subscription_transactions WHERE id = $1`, [tx.id])).rows[0].status !== 'paid', `HTTP ${forgedByRequestId.status}`);
const forgedFail = await axios.post(`${base}/subscriptions/webhooks/clickpesa`, { event: 'PAYMENT FAILED', data: { id: `ZZ-EVT3-${Date.now()}`, status: 'FAILED', orderReference: tx.id } }, { validateStatus: () => true });
ok('a forged "failed" notice cannot cancel a pending payment either', (await pool.query(`SELECT status FROM subscription_transactions WHERE id = $1`, [tx.id])).rows[0].status === 'pending', `HTTP ${forgedFail.status}`);
const unknown = await axios.post(`${base}/subscriptions/webhooks/clickpesa`, { event: 'PAYMENT RECEIVED', data: { id: `ZZ-EVT4-${Date.now()}`, status: 'SUCCESS', orderReference: 'does-not-exist' } }, { validateStatus: () => true });
ok('a notice for an unknown payment is ignored', unknown.status === 200 && unknown.data.processed === false, JSON.stringify(unknown.data));
await pool.query(`DELETE FROM subscription_transactions WHERE id = $1`, [tx.id]); await pool.query(`DELETE FROM payment_webhook_events WHERE event_id LIKE 'ZZ-EVT%'`);

// ── support tickets ─────────────────────────────────────────────────────────────────────────────
const created = await Sup.createTicket({ name: 'Deus', email: 'deusleon7@gmail.com', category: 'question', subject: `ZZ ticket ${Date.now()}`, message: 'Please help', context: { page: '/dashboard' } });
ok('a signed-in person sends a ticket and gets a ticket number', created.success && /^TKT-\d+$/.test(created.ticket.ticket_number), created.ticket?.ticket_number);
try { await Sup.createTicket({ subject: 'x' }); ok('a ticket without message/email is refused', false); } catch (e) { ok('a ticket without message/email is refused', e.status === 400, e.message); }
const mine = await Sup.myTickets(); ok('my tickets lists it with its status', mine.some((x) => x.ticket_number === created.ticket.ticket_number && x.status === 'open'));
const track = await axios.get(`${base}/support/tickets/track`, { params: { ticket_number: created.ticket.ticket_number, email: 'deusleon7@gmail.com' }, validateStatus: () => true });
ok('a ticket can be tracked with its number + the email used', track.status === 200 && track.data.ticket?.ticket_number === created.ticket.ticket_number, `HTTP ${track.status}`);
const wrongTrack = await axios.get(`${base}/support/tickets/track`, { params: { ticket_number: created.ticket.ticket_number, email: 'someone.else@test.com' }, validateStatus: () => true });
ok("someone else's email cannot read the ticket", wrongTrack.status === 404 || wrongTrack.status === 403 || !wrongTrack.data.ticket, `HTTP ${wrongTrack.status}`);
if (!staff) {
  const a = await raw(ownerToken, 'get', '/support/admin/tickets'); const s = await raw(ownerToken, 'get', '/support/admin/stats'); const r = await raw(ownerToken, 'post', '/support/admin/tickets/1/reply', { message: 'x' });
  ok('an ordinary owner is refused on the whole help desk', [a.status, s.status, r.status].every((x) => x === 403), `${a.status}/${s.status}/${r.status}`);
} else {
  ok('support staff pass the access check', (await Sup.adminAccess()).allowed === true);
  const list = await Sup.adminList({ status: 'open', search: created.ticket.ticket_number }); const t = list.tickets.find((x) => x.ticket_number === created.ticket.ticket_number);
  ok('help desk lists the ticket with store and reply count', !!t && 'store_name' in t && 'reply_count' in t && list.counts.open >= 1);
  await Sup.adminSetStatus(t.id, 'in_progress'); ok('status change', (await Sup.adminGet(t.id)).status === 'in_progress');
  await Sup.adminReply(t.id, 'We are on it', false); await Sup.adminReply(t.id, 'internal only', true);
  const full = await Sup.adminGet(t.id); ok('a reply and an internal note are both kept on the ticket', full.replies.length === 2 && full.replies.some((r) => r.is_internal));
  const mine2 = (await Sup.myTickets()).find((x) => x.ticket_number === created.ticket.ticket_number);
  ok('the person sees the reply but NOT the internal note', mine2.replies.length === 1 && mine2.replies[0].message === 'We are on it', JSON.stringify(mine2.replies.map((r) => r.message)));
  await Sup.adminSetStatus(t.id, 'resolved'); ok('resolving sets the resolved time', !!(await Sup.adminGet(t.id)).resolved_at);
  const st = await Sup.adminStats(); ok('help desk statistics', st.total >= 1 && typeof st.counts === 'object');
  try { await Sup.adminSetStatus(t.id, 'nonsense'); ok('an unknown status is refused', false); } catch (e) { ok('an unknown status is refused', e.status === 400, e.message); }
}
await pool.query(`DELETE FROM support_ticket_replies WHERE ticket_id IN (SELECT id FROM support_tickets WHERE subject LIKE 'ZZ ticket %')`).catch(() => {});
await pool.query(`DELETE FROM support_tickets WHERE subject LIKE 'ZZ ticket %'`).catch(() => {});
await pool.end(); finish();
