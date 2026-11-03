import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'pfs1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HEX_KEY = /^[0-9a-fA-F]{64}$/;

/** Never carries the secret, the sealed text or the key. */
const unopenable = (): Error => new Error('Geheimnis lässt sich nicht öffnen');

/** The key from `PANDAFIT_SECRET_KEY`: exactly 64 hex characters, nothing else. */
export const secretKeyFrom = (env: string | undefined): Buffer => {
  if (typeof env !== 'string' || !HEX_KEY.test(env)) throw new Error('PANDAFIT_SECRET_KEY fehlt oder ist ungültig');
  return Buffer.from(env, 'hex');
};

const checkKey = (key: Buffer): void => {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw new Error('Schlüssel hat nicht 32 Bytes');
};

/** AES-256-GCM with a fresh random IV. The label (`<accountId>:<kind>`) is authenticated, so a sealed text only opens where it belongs. */
export const sealText = (key: Buffer, label: string, plain: string): string => {
  checkKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(label, 'utf8'));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [PREFIX, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
};

/** Decodes strictly: any text that is not exactly what encoding the bytes gives is refused, so no changed character slips through. */
const strict = (part: string): Buffer => {
  const bytes = Buffer.from(part, 'base64url');
  if (bytes.toString('base64url') !== part) throw unopenable();
  return bytes;
};

/** Throws on any change, another key or another label. Never returns garbage. */
export const openText = (key: Buffer, label: string, sealed: string): string => {
  checkKey(key);
  if (typeof sealed !== 'string') throw unopenable();
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) throw unopenable();
  const iv = strict(parts[1]);
  const tag = strict(parts[2]);
  const ct = strict(parts[3]);
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw unopenable();
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(label, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    throw unopenable();
  }
};

/** How a secret is stored on disk. */
export type SecretCodec = { seal(plain: string): string; open(stored: string): string };

/** The Mac's way, as today: the file holds the secret itself. */
export const PLAIN_CODEC: SecretCodec = { seal: (plain) => plain, open: (stored) => stored };

export const sealedCodec = (key: Buffer, label: string): SecretCodec => {
  checkKey(key);
  return { seal: (plain) => sealText(key, label, plain), open: (stored) => openText(key, label, stored) };
};
