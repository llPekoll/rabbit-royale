import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT, generateKeyPair } from 'jose';
import { GET, POST } from '@/app/api/auth/google/native/route';

const post = (body: unknown) =>
  POST(new Request('http://x/api/auth/google/native', { method: 'POST', body: JSON.stringify(body) }));

describe('native Google sign-in (api/auth/google/native)', () => {
  const before = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'web-client.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
  });
  afterEach(() => {
    for (const [k, v] of [['GOOGLE_CLIENT_ID', before.id], ['GOOGLE_CLIENT_SECRET', before.secret]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('names the web client the Android sheet must ask for', async () => {
    expect(await (await GET()).json()).toEqual({ clientId: 'web-client.apps.googleusercontent.com' });
  });

  it('is unavailable without the Google keys', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect((await GET()).status).toBe(503);
    expect((await post({ idToken: 'x' })).status).toBe(503);
  });

  it('refuses a token Google did not sign, whatever it claims', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({ email: 'a@b.com', email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'forged' })
      .setIssuer('https://accounts.google.com')
      .setAudience('web-client.apps.googleusercontent.com')
      .setSubject('123')
      .setExpirationTime('1h')
      .sign(privateKey);
    const res = await post({ idToken: forged });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'google_failed' });
    expect((await post({})).status).toBe(400);
  });

  it('links only with a session', async () => {
    expect((await post({ idToken: 'x', link: true })).status).toBe(401);
  });
});
