import { fileURLToPath as _ftu } from 'url';
import _path from 'path';
const __filename = _ftu(import.meta.url);
const __dirname = _path.dirname(__filename);
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
// Prefer the key pasted in .env (QZ_PRIVATE_KEY). A file path is the fallback (QZ_PRIVATE_KEY_PATH or backend/certs/qz-private-key.pem).
const PRIVATE_KEY_PATH = () => process.env.QZ_PRIVATE_KEY_PATH || path.join(__dirname, '..', '..', 'certs', 'qz-private-key.pem');

function loadPrivateKey() {
  const inline = String(process.env.QZ_PRIVATE_KEY || '').trim().replace(/\\n/g, '\n');
  if (inline.includes('BEGIN') && !inline.includes('END')) {
    console.error('QZ private key is truncated. Keep QZ_PRIVATE_KEY in double quotes with \\n between lines, or set QZ_PRIVATE_KEY_PATH.');
    return null;
  }
  if (inline) return inline;
  try {
    return fs.readFileSync(PRIVATE_KEY_PATH(), 'utf8');
  } catch {
    return null;
  }
}

// The key is often pasted into .env while the server is already running. Read it again
// on the next print instead of keeping the empty value from startup.
let privateKey = loadPrivateKey();

function signingKey(force = false) {
  if (privateKey && !force) return privateKey;
  dotenv.config({ override: true });
  privateKey = loadPrivateKey();
  if (!privateKey) console.error('QZ Tray private key is not set. Add QZ_PRIVATE_KEY to backend/.env, or set QZ_PRIVATE_KEY_PATH.');
  return privateKey;
}

export const sign = (req, res) => {
  const { request } = req.body;

  if (!request || typeof request !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid request parameter' });
  }

  const key = signingKey();
  if (!key) {
    return res.status(500).json({ error: 'Signing key not configured', message: 'The printer signing key is not loaded on the server.' });
  }

  const produce = (pem) => {
    const signer = crypto.createSign('SHA512');
    signer.update(request);
    return signer.sign(pem, 'base64');
  };

  try {
    return res.json({ signature: produce(key) });
  } catch (err) {
    const refreshed = signingKey(true);
    if (refreshed && refreshed !== key) {
      try {
        return res.json({ signature: produce(refreshed) });
      } catch (again) {
        console.error('QZ signing failed:', again.message);
      }
    } else {
      console.error('QZ signing failed:', err.message);
    }
    return res.status(500).json({ error: 'Signing failed', message: 'The printer signing key could not be used.' });
  }
};

