import { fileURLToPath as _ftu } from 'url';
import _path from 'path';
const __filename = _ftu(import.meta.url);
const __dirname = _path.dirname(__filename);
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
const BACKEND_ROOT = path.join(__dirname, '..', '..');
// cPanel's environment screen often keeps only the first line of a pasted key.
// Reading the .env file here still finds the END line, and a .pem file works too.
const ENV_CANDIDATES = () => [
  path.join(BACKEND_ROOT, '.env'),
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'backend', '.env'),
];
const KEY_FILES = () => [
  process.env.QZ_PRIVATE_KEY_PATH,
  path.join(BACKEND_ROOT, 'certs', 'qz-private-key.pem'),
].filter(Boolean);

let keyProblem = 'The printer signing key is not loaded on the server.';

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function normalizePem(label, body) {
  const b64 = String(body).replace(/\\n/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
  if (b64.length < 80) return null;
  return `-----BEGIN ${label}-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
}

function pemFromText(text) {
  if (!text) return null;
  const match = String(text).match(/-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/);
  if (!match) return null;
  return normalizePem(match[1].trim(), match[2]);
}

function loadPrivateKey() {
  keyProblem = 'The printer signing key is not loaded on the server.';
  const envText = ENV_CANDIDATES().map(readText).join('\n');
  const sources = [envText, String(process.env.QZ_PRIVATE_KEY || '').replace(/\\n/g, '\n')];
  for (const source of sources) {
    const pem = pemFromText(source);
    if (pem) return pem;
  }
  for (const file of KEY_FILES()) {
    const pem = pemFromText(readText(file));
    if (pem) return pem;
  }

  const blob = sources.join('\n');
  if (/BEGIN CERTIFICATE/.test(blob) && !/PRIVATE KEY/.test(blob)) {
    keyProblem = 'The server has the printer certificate, not the private key. QZ_PRIVATE_KEY must be the private key.';
  } else if (/BEGIN/.test(blob) && !/END/.test(blob)) {
    keyProblem = 'The printer private key on the server stops at the first line. Keep the whole key, including the END line.';
  }
  console.error(keyProblem);
  return null;
}

// The key is often pasted into .env while the server is already running. Read it again
// on the next print instead of keeping the empty value from startup.
let privateKey = loadPrivateKey();

function signingKey(force = false) {
  if (privateKey && !force) return privateKey;
  for (const file of ENV_CANDIDATES()) dotenv.config({ path: file, override: true });
  privateKey = loadPrivateKey();
  return privateKey;
}

export const sign = (req, res) => {
  const { request } = req.body;

  if (!request || typeof request !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid request parameter' });
  }

  const key = signingKey();
  if (!key) {
    return res.status(500).json({ error: 'Signing key not configured', message: keyProblem });
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

