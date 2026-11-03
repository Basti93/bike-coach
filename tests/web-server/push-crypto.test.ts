import { createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { b64u, encryptPayload, newVapidKeys, vapidAuthorization } from '../../web-server/push';

const un = (s: string) => Buffer.from(s.replace(/\s+/g, ''), 'base64url');

// RFC 8291, section 5 and appendix A.
const V = {
  plaintext: 'When I grow up, I want to be a watermelon',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: `DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml
   mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT
   pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN`,
};

describe('web push crypto (built-in, no dependency)', () => {
  it('encrypts exactly like the RFC 8291 example', () => {
    const out = encryptPayload(Buffer.from(V.plaintext), { p256dh: V.uaPublic.replace(/\s+/g, ''), auth: V.auth }, { salt: un(V.salt), senderPrivate: un(V.asPrivate) });
    expect(b64u(out)).toBe(V.body.replace(/\s+/g, ''));
  });

  it('uses a fresh salt and key for each message', () => {
    const sub = { p256dh: V.uaPublic.replace(/\s+/g, ''), auth: V.auth };
    const a = encryptPayload(Buffer.from('x'), sub), b = encryptPayload(Buffer.from('x'), sub);
    expect(a.subarray(0, 16).equals(b.subarray(0, 16))).toBe(false);
    expect(a.readUInt32BE(16)).toBe(4096);
    expect(a[20]).toBe(65);
  });

  it('refuses a receiver key that is not on the curve', () => {
    const bad = Buffer.alloc(65, 7); bad[0] = 4;
    expect(() => encryptPayload(Buffer.from('x'), { p256dh: b64u(bad), auth: V.auth })).toThrow();
  });

  it('signs a VAPID JWT (ES256, RFC 8292) that verifies with the public key', () => {
    const keys = newVapidKeys();
    expect(un(keys.publicKey).length).toBe(65);
    const h = vapidAuthorization('https://web.push.apple.com/abc/def', keys, 'mailto:ops@example.org', 1_800_000_000_000);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(h);
    expect(m).not.toBeNull();
    expect(m![2]).toBe(keys.publicKey);
    const [head, claims, sig] = m![1]!.split('.');
    expect(JSON.parse(un(head!).toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    const c = JSON.parse(un(claims!).toString());
    expect(c).toEqual({ aud: 'https://web.push.apple.com', exp: 1_800_000_000 + 12 * 3600, sub: 'mailto:ops@example.org' });
    const pub = un(keys.publicKey);
    const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) } });
    expect(verify('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, un(sig!))).toBe(true);
  });
});
