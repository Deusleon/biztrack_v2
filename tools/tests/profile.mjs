import { ok, svc, signIn, finish } from './harness.mjs';
const { profileService } = svc;
await signIn();
const g = await profileService.get();
ok('profile loads WITHOUT the password hash', !('password' in g.data));
const u = await profileService.update({ name: g.data.name, email: g.data.email, phone: '255700000001', preferred_language: 'sw' });
ok('profile update', u.profile.phone === '255700000001' && u.profile.preferred_language === 'sw');
await profileService.update({ name: g.data.name, email: g.data.email, phone: g.data.phone || undefined, preferred_language: g.data.preferred_language });
try { await profileService.changePassword({ current_password: 'wrong-one', new_password: 'Another123' }); ok('wrong current password refused', false); } catch (e) { ok('wrong current password refused', !!e.message, e.message); }
try { await profileService.changePassword({ current_password: process.env.TEST_PASSWORD || 'Test1234!', new_password: 'short' }); ok('short new password refused', false); } catch (e) { ok('short new password refused', !!e.message, e.message); }
const oldToken = localStorage.getItem('accessToken');
const cur = process.env.TEST_PASSWORD || 'Test1234!';
const c = await profileService.changePassword({ current_password: cur, new_password: 'Changed123!' });
ok('password change returns a fresh token', !!c.token && c.password_change_required === false);
localStorage.setItem('accessToken', oldToken);
try { await profileService.get(); ok('OLD token stops working after a password change', false); } catch (e) { ok('OLD token stops working after a password change', e.status === 401, `HTTP ${e.status}`); }
localStorage.setItem('accessToken', c.token);
ok('password restored', !!(await profileService.changePassword({ current_password: 'Changed123!', new_password: cur })).token);
finish();
