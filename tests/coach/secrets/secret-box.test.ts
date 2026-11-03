import { randomBytes } from 'node:crypto';
import { openText, PLAIN_CODEC, sealedCodec, sealText, secretKeyFrom } from '../../../src/coach/secrets/secret-box';

const KEY = Buffer.alloc(32, 7);
const TEXT = 'geheimer-schluessel-123';

const flipIn = (sealed: string, part: number): string => {
  const parts = sealed.split('.');
  const bytes = Buffer.from(parts[part], 'base64url');
  bytes[0] ^= 0x01;
  parts[part] = bytes.toString('base64url');
  return parts.join('.');
};

test('seal then open returns the text, and the output starts with pfs1. and does not contain the text', () => {
  const sealed = sealText(KEY, 'acc1:hevy', TEXT);
  expect(sealed.startsWith('pfs1.')).toBe(true);
  expect(sealed.split('.')).toHaveLength(4);
  expect(sealed).not.toContain(TEXT);
  expect(Buffer.from(sealed.split('.')[1], 'base64url')).toHaveLength(12);
  expect(openText(KEY, 'acc1:hevy', sealed)).toBe(TEXT);
  expect(openText(KEY, 'acc1:hevy', sealText(KEY, 'acc1:hevy', ''))).toBe('');
});

test('two seals of the same text differ', () => {
  const a = sealText(KEY, 'acc1:hevy', TEXT);
  const b = sealText(KEY, 'acc1:hevy', TEXT);
  expect(a).not.toBe(b);
  expect(a.split('.')[1]).not.toBe(b.split('.')[1]);
});

test('a flipped byte, another key or another label throws', () => {
  const sealed = sealText(KEY, 'acc1:hevy', TEXT);
  for (const part of [1, 2, 3]) expect(() => openText(KEY, 'acc1:hevy', flipIn(sealed, part))).toThrow();
  expect(() => openText(randomBytes(32), 'acc1:hevy', sealed)).toThrow();
  expect(() => openText(KEY, 'acc2:hevy', sealed)).toThrow();
  expect(() => openText(KEY, 'acc1:garmin', sealed)).toThrow();
  expect(() => openText(KEY, 'acc1:hevy', sealed.replace(/^pfs1/, 'pfs2'))).toThrow();
  expect(() => openText(KEY, 'acc1:hevy', `${sealed}.x`)).toThrow();
  expect(() => openText(KEY, 'acc1:hevy', sealed.slice(0, -2))).toThrow();
  expect(() => openText(KEY, 'acc1:hevy', TEXT)).toThrow();
  // Every single changed character of the stored text, not only of the decoded bytes.
  for (let i = 5; i < sealed.length; i++) {
    if (sealed[i] === '.') continue;
    const changed = sealed.slice(0, i) + (sealed[i] === 'A' ? 'B' : 'A') + sealed.slice(i + 1);
    expect(() => openText(KEY, 'acc1:hevy', changed)).toThrow();
  }
});

test('an error never carries the secret or the sealed text', () => {
  const sealed = sealText(KEY, 'acc1:hevy', TEXT);
  try { openText(KEY, 'acc2:hevy', sealed); throw new Error('opened'); } catch (e) {
    const text = `${String(e)} ${(e as Error).stack ?? ''}`;
    expect(text).not.toContain(TEXT);
    expect(text).not.toContain(sealed);
    expect(text).not.toContain(KEY.toString('hex'));
  }
});

test('secretKeyFrom refuses a missing, 63-character or non-hex key', () => {
  const message = 'PANDAFIT_SECRET_KEY fehlt oder ist ungültig';
  expect(() => secretKeyFrom(undefined)).toThrow(message);
  expect(() => secretKeyFrom('')).toThrow(message);
  expect(() => secretKeyFrom('a'.repeat(63))).toThrow(message);
  expect(() => secretKeyFrom('a'.repeat(65))).toThrow(message);
  expect(() => secretKeyFrom(`${'a'.repeat(63)}g`)).toThrow(message);
  expect(() => secretKeyFrom(` ${'a'.repeat(64)}`)).toThrow(message);
  const key = secretKeyFrom('0123456789abcdef'.repeat(4));
  expect(key).toHaveLength(32);
  expect(key.toString('hex')).toBe('0123456789abcdef'.repeat(4));
  expect(secretKeyFrom('ABCDEF0123456789'.repeat(4))).toHaveLength(32);
});

test('a sealed codec seals with its label and the plain codec changes nothing', () => {
  const codec = sealedCodec(KEY, 'acc1:hevy');
  const stored = codec.seal(TEXT);
  expect(stored.startsWith('pfs1.')).toBe(true);
  expect(codec.open(stored)).toBe(TEXT);
  expect(() => sealedCodec(KEY, 'acc2:hevy').open(stored)).toThrow();
  expect(PLAIN_CODEC.seal(TEXT)).toBe(TEXT);
  expect(PLAIN_CODEC.open(TEXT)).toBe(TEXT);
});

test('a key of the wrong length is refused when sealing', () => {
  expect(() => sealText(Buffer.alloc(16), 'acc1:hevy', TEXT)).toThrow();
});

test('a sealed codec refuses an empty label', () => {
  expect(() => sealedCodec(KEY, '')).toThrow();
});
