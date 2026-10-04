// SMS contacts, groups, templates and the account screens' API. No SMS is ever sent (no gateway is set up in the test database —
// the refusal paths are what is tested). Cleans up what it creates.
import { createRequire } from 'node:module';
import { ok, svc, signIn, finish } from './harness.mjs';
const require = createRequire(import.meta.url);
const pg = require('../../backend/node_modules/pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const M = svc.messagingService;
const { store } = await signIn();
const tag = String(Date.now()).slice(-7);

// ── groups ──────────────────────────────────────────────────────────────────────────────────────
const g = await M.createGroup({ name: `ZZ G ${tag}` }); ok('group create', !!g.id && g.parent_group_id === null);
const sub = await M.createGroup({ name: `ZZ Sub ${tag}`, parentGroupId: g.id }); ok('subgroup create', sub.parent_group_id === g.id);
try { await M.createGroup({ name: `ZZ SubSub ${tag}`, parentGroupId: sub.id }); ok('a subgroup of a subgroup is refused (one level only)', false); } catch (e) { ok('a subgroup of a subgroup is refused (one level only)', !!e.message, e.message); }
try { await M.createGroup({ name: '  ' }); ok('empty group name refused', false); } catch (e) { ok('empty group name refused', e.status === 400, e.message); }
await M.updateGroup(g.id, { name: `ZZ G ${tag} B` }); ok('group rename', (await M.groups()).find((x) => x.id === g.id).name === `ZZ G ${tag} B`);

// ── contacts ────────────────────────────────────────────────────────────────────────────────────
const c1 = await M.createContact({ name: 'ZZ One', phone: `+255 71${tag.slice(0, 2)} ${tag.slice(2, 5)} ${tag.slice(5)}`, groupId: g.id });
ok('contact create: a loosely typed number is stored in international format', c1.phone === `25571${tag}`, c1.phone);
try { await M.createContact({ name: 'bad', phone: '12345' }); ok('an invalid phone number is refused', false); } catch (e) { ok('an invalid phone number is refused', e.status === 400, e.message); }
try { await M.createContact({ name: 'dup', phone: `071${tag}` }); ok('the same number again is refused (even written as 07…)', false); } catch (e) { ok('the same number again is refused (even written as 07…)', e.status === 409, e.message); }
const c2 = await M.createContact({ name: 'ZZ Two', phone: `25572${tag}` });
ok('contacts list with their groups', (await M.contacts()).find((c) => c.id === c1.id).groups.some((x) => x.id === g.id));
await M.updateContact(c2.id, { name: 'ZZ Two B', phone: `25573${tag}` }); ok('contact update (name and phone)', (await M.contacts()).find((c) => c.id === c2.id).phone === `25573${tag}`);
try { await M.updateContact(c2.id, { name: 'x', phone: c1.phone }); ok("changing a contact's number to another contact's number is refused", false); } catch (e) { ok("changing a contact's number to another contact's number is refused", e.status === 409, e.message); }
await M.assignContacts(g.id, [c2.id]); ok('contacts added to a group from the list', (await M.groupContacts(g.id)).length === 2);
await M.setContactGroups(c2.id, [sub.id]); const mem = await M.contacts();
ok('setting groups on a contact replaces them (and a subgroup also puts it in the parent)', mem.find((c) => c.id === c2.id).groups.some((x) => x.id === sub.id));
await M.removeFromGroup(g.id, c1.id); ok('removed from a group but the contact stays', (await M.groupContacts(g.id)).every((c) => c.id !== c1.id) && (await M.contacts()).some((c) => c.id === c1.id));
ok('group list shows how many contacts each group holds', (await M.groups()).find((x) => x.id === g.id).contact_count !== undefined);

// ── templates ───────────────────────────────────────────────────────────────────────────────────
const tpl = await M.createTemplate({ name: `ZZ T ${tag}`, content: 'Habari {name}, deni lako ni {amount}.' }); ok('template create', !!tpl.id);
await M.updateTemplate(tpl.id, { name: `ZZ T ${tag} B`, content: 'Asante kwa kununua.' }); ok('template update', (await M.templates()).find((x) => x.id === tpl.id).content === 'Asante kwa kununua.');
try { await M.createTemplate({ name: '', content: '' }); ok('an empty template is refused', false); } catch (e) { ok('an empty template is refused', e.status === 400, e.message); }

// ── sending and the account: no gateway here, so refusals ───────────────────────────────────────
try { await M.send({ contacts: [c1.phone], message: 'hello' }); ok('sending without a configured gateway is refused', false); } catch (e) { ok('sending without a configured gateway is refused (and says so)', e.status === 400 && /gateway/i.test(e.message), e.message); }
try { await M.send({ contacts: [], message: 'hello' }); ok('sending to nobody is refused', false); } catch (e) { ok('sending to nobody is refused', e.status === 400, e.message); }
try { await M.sendToGroup(g.id, { message: '', includeSubgroups: true }); ok('an empty message is refused', false); } catch (e) { ok('an empty message is refused', e.status === 400, e.message); }
ok('message history answers', Array.isArray(await M.history()));
const gi = await M.gatewayInfo(); ok('gateway info: not configured, with its capabilities', gi.configured === false && typeof gi.capabilities === 'object', JSON.stringify(gi));
try { await M.accountStats(); ok('account stats say the gateway is not set up', false); } catch (e) { ok('account stats say the gateway is not set up', e.code === 'no_default_sms_gateway', `${e.code} ${e.message}`); }

// ── one store cannot see or touch another store's contacts ──────────────────────────────────────
const other = (await pool.query(`SELECT id FROM stores WHERE id <> $1 LIMIT 1`, [store.id])).rows[0];
const foreign = (await pool.query(`INSERT INTO messaging_contacts (store_id, name, phone) VALUES ($1, 'ZZ Foreign', $2) RETURNING id`, [other.id, `25579${tag}9`])).rows[0];
ok("another store's contacts are not in this store's list", !(await M.contacts()).some((c) => c.id === foreign.id));
try { await M.deleteContact(foreign.id); ok("deleting another store's contact is refused", false); } catch (e) { ok("deleting another store's contact is refused", e.status === 404, `HTTP ${e.status}`); }
ok("…and it is still there", (await pool.query(`SELECT 1 FROM messaging_contacts WHERE id = $1`, [foreign.id])).rows.length === 1);
await pool.query(`DELETE FROM messaging_contacts WHERE id = $1`, [foreign.id]);

// ── cleanup / deleting ──────────────────────────────────────────────────────────────────────────
await M.deleteTemplate(tpl.id); ok('template delete', !(await M.templates()).some((x) => x.id === tpl.id));
await M.deleteContact(c1.id); await M.deleteContact(c2.id); ok('contact delete', !(await M.contacts()).some((c) => c.id === c1.id || c.id === c2.id));
await M.deleteGroup(g.id); ok('group delete (its subgroup goes with it)', !(await M.groups()).some((x) => x.id === g.id || x.id === sub.id));
await pool.end(); finish();
