// BizTrack AI with NO provider key (the test database has none): the assistant still answers from VERIFIED data fetched by tools,
// and every call is limited by the person's ai_* permissions. What a real model (Gemini/Groq/OpenAI/Ollama) writes cannot be tested here.
import { createRequire } from 'node:module';
import { ok, svc, signIn, finish } from './harness.mjs';
const require = createRequire(import.meta.url);
const pg = require('../../backend/node_modules/pg');
const { default: axios } = await import('../../frontend/node_modules/axios/index.js');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { aiService: AI, roleService: Ro, permissionService: P, userAdminService: U, reportService: R } = svc;
const { store } = await signIn();
const base = process.env.API_URL; const tag = Date.now();
const as = (token) => (m, p, d) => axios({ method: m, url: base + p, headers: { Authorization: `Bearer ${token}`, 'X-Store-ID': store.id }, data: d, validateStatus: () => true, timeout: 60000 });
const owner = as(localStorage.getItem('accessToken'));

// ── what the server says about itself ───────────────────────────────────────────────────────────
const ps = await AI.providerStatus(); ok('provider status: not configured here, fallback enabled', ps.configured === false && ps.fallbackEnabled === true, `${ps.requested} ${ps.model}`);
const caps = await AI.capabilities(); ok('capabilities: the tools this person may use, grouped', caps.toolCount >= 10 && caps.tools.every((x) => x.id && x.requiredPermissions?.length) && Object.keys(caps.capabilities).length >= 3, `${caps.toolCount} tools`);
ok('the owner holds every ai_* permission', ['ai_access', 'ai_chat', 'ai_sales_insights', 'ai_profit_insights', 'ai_inventory_insights', 'ai_explain_reports'].every((p) => caps.permissions.includes(p)));

// ── chat ────────────────────────────────────────────────────────────────────────────────────────
const bad = await owner('post', '/ai/chat', { message: '   ' }); ok('an empty question is refused', bad.status === 400, bad.data.message);
const long = await owner('post', '/ai/chat', { message: 'x'.repeat(1001) }); ok('a question over 1000 characters is refused', long.status === 400, long.data.message);
const a1 = await AI.ask({ message: 'How were my sales today?' });
ok('an answer comes with the tool that produced it, marked as verified', !!a1.conversationId && a1.toolsUsed.includes('getSalesSummary') && a1.sources?.every((s) => s.verified === true) && a1.confidence, `tools ${a1.toolsUsed}, source ${a1.source}`);
ok('with no AI provider the answer says so (source "fallback")', a1.source === 'fallback' && /provider/i.test(a1.answer) || a1.source === 'ai', a1.answer.slice(0, 90));
const a2 = await AI.ask({ message: 'And what about my profit?', conversationId: a1.conversationId });
ok('a follow-up stays in the same conversation', a2.conversationId === a1.conversationId && a2.toolsUsed.length > 0, a2.toolsUsed.join(','));
const list = await AI.conversations(); ok('conversation list holds it with a title and preview', list.some((c) => c.id === a1.conversationId && c.title && c.preview));
const conv = await AI.conversation(a1.conversationId); ok('the conversation keeps both questions and both answers, in order', conv.messages.length >= 4 && conv.messages[0].role === 'user' && conv.messages[1].role === 'assistant', `${conv.messages.length} messages`);
const other = await owner('get', `/ai/conversations/00000000-0000-0000-0000-000000000001`); ok('a conversation that is not yours is not found', other.status === 404, `HTTP ${other.status}`);
await AI.deleteConversation(a1.conversationId); ok('delete a conversation', !(await AI.conversations()).some((c) => c.id === a1.conversationId));

// ── business summary and report explanations ────────────────────────────────────────────────────
const sum = await AI.businessSummary(true); ok('business summary: a sentence, signals with severity, the source', typeof sum.summary === 'string' && sum.summary.length > 20 && Array.isArray(sum.signals) && sum.signals.every((s) => s.type && s.severity) && sum.source, sum.summary.slice(0, 80));
const again = await AI.businessSummary(false); ok('the summary is cached for a few minutes (and refresh forces a new one)', again.cached === true);
const range = { startDate: '2000-01-01', endDate: '2099-12-31' };
const ex = await AI.explainReport({ reportType: 'sales', reportKey: 'summary', filters: range }); const rep = await R.get('/sales', range);
ok("the explanation is built on the SAME figures as the report (sales total)", Math.abs(Number(ex.context.summary.total_sales) - Number(rep.summary.total_amount)) < 0.5 && Number(ex.context.summary.total_invoices) === Number(rep.summary.total_invoices), `${ex.context.summary.total_sales} vs ${rep.summary.total_amount}`);
for (const type of ['profit', 'inventory']) { const e = await AI.explainReport({ reportType: type, reportKey: 'summary', filters: range }); ok(`explain ${type}: text + verified context`, e.explanation.length > 20 && !!e.context && e.confidence === 'high'); }
const unsupported = await owner('post', '/ai/explain', { reportType: 'nonsense', reportKey: 'x' }); ok('an unsupported report type is refused', unsupported.status === 400, unsupported.data.message);
const nokey = await owner('post', '/ai/explain', { reportType: 'sales' }); ok('a missing report key is refused', nokey.status === 400);

// ── permissions: a person with ONLY ai_access/ai_chat ───────────────────────────────────────────
const role = (await Ro.create({ name: `ZZ AI ${tag}`, description: 'test' })).data;
const matrix = (await P.get(role.id)).data; const perm = (n) => Object.values(matrix).flatMap((m) => Object.values(m).flat()).find((p) => p.name === n);
for (const n of ['ai_access', 'ai_chat']) await P.set({ roleId: role.id, permissionId: perm(n).id, isAllowed: true });
const email = `zz.ai.${tag}@test.com`; await U.create({ full_name: 'ZZ AI', email, password: 'Staff1234!', role: role.name, status: true });
const login = await axios.post(`${base}/auth/login`, { email, password: 'Staff1234!' }, { validateStatus: () => true });
const sw = await axios.post(`${base}/auth/switch-store`, { storeId: store.id }, { headers: { Authorization: `Bearer ${login.data.token}` }, validateStatus: () => true });
const staff = as(sw.data.token || login.data.token);
const c1 = await staff('post', '/ai/chat', { message: 'How were my sales today?' });
ok('without ai_sales_insights the assistant may NOT read sales (the tool is denied)', c1.status === 200 && !c1.data.data.toolsUsed.includes('getSalesSummary'), `used ${c1.data.data?.toolsUsed}, denied ${c1.data.data?.toolsDenied}`);
const e1 = await staff('post', '/ai/explain', { reportType: 'sales', reportKey: 'summary', filters: range }); ok('without ai_explain_reports / ai_sales_insights a report cannot be explained', e1.status === 403, `HTTP ${e1.status}`);
const s1 = await staff('get', '/ai/capabilities'); ok('capabilities list only what this person may use', s1.data.data.toolCount < caps.toolCount, `${s1.data.data.toolCount} of ${caps.toolCount} tools`);
for (const n of ['ai_sales_insights', 'ai_explain_reports']) await P.set({ roleId: role.id, permissionId: perm(n).id, isAllowed: true });
const c2 = await staff('post', '/ai/chat', { message: 'How were my sales today?' }); ok('once ai_sales_insights is granted the same question uses the sales tool', c2.data.data.toolsUsed.includes('getSalesSummary'), `used ${c2.data.data?.toolsUsed}`);
const e2 = await staff('post', '/ai/explain', { reportType: 'sales', reportKey: 'summary', filters: range }); ok('…and the sales report can now be explained', e2.status === 200, `HTTP ${e2.status}`);
const e3 = await staff('post', '/ai/explain', { reportType: 'profit', reportKey: 'summary', filters: range }); ok('…but profit still cannot (no ai_profit_insights)', e3.status === 403, `HTTP ${e3.status}`);
const audit = await staff('get', '/ai/audit-logs'); ok('the AI audit log needs ai_view_audit', audit.status === 403, `HTTP ${audit.status}`);
const ownerAudit = await owner('get', '/ai/audit-logs'); ok('the owner can read the AI audit log (every question is recorded)', ownerAudit.status === 200 && Array.isArray(ownerAudit.data.data) && ownerAudit.data.data.length > 0);

// ── cleanup ─────────────────────────────────────────────────────────────────────────────────────
const gone = (await U.list({ search: `zz.ai.${tag}`, limit: 5 })).data[0]; if (gone) await U.remove(gone.id);
await Ro.remove(role.id);
await pool.end(); finish();
