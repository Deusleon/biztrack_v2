// FILE PATH: backend/src/utils/passwordStamp.js
/**
 * A token carries a "stamp" of when the password last changed (`pwa`, in seconds). Once the password is changed or
 * reset, the stamp in every older token no longer matches the account's, and the server refuses them — so a stolen or
 * forgotten session cannot outlive a password change. (Tokens issued before this existed carry no stamp and keep
 * working until they expire, so nobody is signed out by the upgrade itself.)
 */
import pool from '../config/db.js';

export const stampOf = (value) => (value ? Math.floor(new Date(value).getTime() / 1000) : 0);

export const passwordStamp = async (userId, db = pool) => {
  const { rows } = await db.query('SELECT password_changed_at FROM users WHERE id = $1', [userId]);
  return stampOf(rows[0]?.password_changed_at);
};
