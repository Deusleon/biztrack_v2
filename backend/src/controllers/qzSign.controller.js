import { fileURLToPath as _ftu } from 'url';
import _path from 'path';
const __filename = _ftu(import.meta.url);
const __dirname = _path.dirname(__filename);
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
// Prefer the key pasted in .env (QZ_PRIVATE_KEY). A file path is the fallback (QZ_PRIVATE_KEY_PATH or backend/certs/qz-private-key.pem).
const PRIVATE_KEY_PATH = process.env.QZ_PRIVATE_KEY_PATH || path.join(__dirname, '..', '..', 'certs', 'qz-private-key.pem');

function loadPrivateKey() {
  const inline = String(process.env.QZ_PRIVATE_KEY || '').trim();
  if (inline) return inline.replace(/\\n/g, '\n');
  try {
    return fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  } catch {
    console.error('QZ Tray private key is not set. Add QZ_PRIVATE_KEY to backend/.env, or set QZ_PRIVATE_KEY_PATH.');
    return null;
  }
}

const privateKey = loadPrivateKey();

export const sign = (req, res) => {
  const { request } = req.body;

  if (!request || typeof request !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid request parameter' });
  }

  if (!privateKey) {
    return res.status(500).json({ error: 'Signing key not configured' });
  }

  try {
    const sign = crypto.createSign('SHA512');
    sign.update(request);
    const signature = sign.sign(privateKey, 'base64');
    return res.json({ signature });
  } catch (err) {
    console.error('QZ signing failed:', err.message);
    return res.status(500).json({ error: 'Signing failed' });
  }
};

