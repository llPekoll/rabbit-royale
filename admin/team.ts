/**
 * The back office's team: who may sign in, and as what.
 *
 * The OWNER is not a row: `ADMIN_OWNER_EMAIL` (yohann.mepa@gmail.com) with
 * the code of `ADMIN_TOTP_SECRET`, so no mistake in this table can lock him
 * out. Everyone else is a row of `rr_admin.members`, added by the owner,
 * with an authenticator secret of their own — VIEWER for now: they see the
 * numbers, nothing more.
 *
 * Added = a one-time setup link (seven days) that the owner sends them. It
 * shows their QR code once and asks for a first code; the owner never sees
 * their secret. A new link resets it (lost phone).
 *
 * The rows live in Europe's database, in a schema of their own (`rr_admin`),
 * outside the game's: drizzle never sees it, the game never reads it. This
 * connection is the only one rr-admin opens that can write, and it writes
 * only there.
 */
import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { adminSecret, base32Encode, checkTotp } from './totp';

export type Role = 'owner' | 'viewer';
export const ROLES_GRANTED: Role[] = ['viewer'];
const SETUP_DAYS = 7;

export const OWNER = (process.env.ADMIN_OWNER_EMAIL ?? 'yohann.mepa@gmail.com').trim().toLowerCase();

let _sql: postgres.Sql | null = null;
let ready: Promise<void> | null = null;

function sql(): postgres.Sql {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be set');
  _sql = postgres(url, { max: 1, idle_timeout: 60, onnotice: () => {}, connection: { application_name: 'rr-admin-team' } });
  return _sql;
}

/** The schema and its one table, made on first use. */
function ensure(): Promise<void> {
  ready ??= (async () => {
    const q = sql();
    await q`create schema if not exists rr_admin`;
    await q`
      create table if not exists rr_admin.members (
        email          text primary key,
        role           text not null,
        totp_secret    text not null,
        setup_hash     text,
        setup_expires  timestamptz,
        added_by       text not null,
        added_at       timestamptz not null default now(),
        last_login_at  timestamptz
      )`;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export function cleanEmail(s: unknown): string | null {
  const e = String(s ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200 ? e : null;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** What this address may do now: the owner, an active member, or nothing. */
export async function roleOf(email: string): Promise<Role | null> {
  if (email === OWNER) return adminSecret() ? 'owner' : null;
  await ensure();
  const [m] = await sql()`select role from rr_admin.members where email = ${email} and setup_hash is null`;
  return m && ROLES_GRANTED.includes(m.role) ? (m.role as Role) : null;
}

/** Sign-in: the address and the six digits of its own authenticator. */
export async function signIn(email: string, code: string): Promise<Role | null> {
  if (email === OWNER) {
    const s = adminSecret();
    return s && checkTotp(s, code) !== null ? 'owner' : null;
  }
  await ensure();
  const [m] = await sql()`select role, totp_secret from rr_admin.members where email = ${email} and setup_hash is null`;
  if (!m || !ROLES_GRANTED.includes(m.role) || checkTotp(m.totp_secret, code) === null) return null;
  await sql()`update rr_admin.members set last_login_at = now() where email = ${email}`;
  return m.role as Role;
}

export async function listMembers() {
  await ensure();
  return sql()`
    select email, role, setup_hash is null as active, setup_expires, added_by, added_at, last_login_at
    from rr_admin.members order by added_at`;
}

/** A fresh secret and setup link for this address: a new member, or a reset. */
async function issue(email: string, role: Role, by: string, isNew: boolean): Promise<string | null> {
  await ensure();
  const secret = base32Encode(randomBytes(20));
  const token = randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + SETUP_DAYS * 86_400_000);
  const rows = isNew
    ? await sql()`
        insert into rr_admin.members (email, role, totp_secret, setup_hash, setup_expires, added_by)
        values (${email}, ${role}, ${secret}, ${hash(token)}, ${expires}, ${by})
        on conflict (email) do nothing returning email`
    : await sql()`
        update rr_admin.members set totp_secret = ${secret}, setup_hash = ${hash(token)}, setup_expires = ${expires}
        where email = ${email} returning email`;
  return rows.length ? token : null;
}

export const addMember = (email: string, role: Role, by: string) => issue(email, role, by, true);
export const resetMember = (email: string, by: string) => issue(email, 'viewer', by, false);

export async function removeMember(email: string): Promise<boolean> {
  await ensure();
  return (await sql()`delete from rr_admin.members where email = ${email} returning email`).length > 0;
}

async function bySetup(token: string) {
  await ensure();
  const [m] = await sql()`
    select email, role, totp_secret from rr_admin.members
    where setup_hash = ${hash(token)} and setup_expires > now()`;
  return m ?? null;
}

/** The setup link opened: the address and the secret to put in the app. */
export async function setupInfo(token: string) {
  const m = await bySetup(token);
  if (!m) return null;
  const label = encodeURIComponent(`Rabbit Royale:${m.email}`);
  return {
    email: m.email as string,
    secret: m.totp_secret as string,
    uri: `otpauth://totp/${label}?secret=${m.totp_secret}&issuer=Rabbit%20Royale&digits=6&period=30`,
  };
}

/** The first code proves the app has it: the link dies, the member is in. */
export async function setupConfirm(token: string, code: string): Promise<{ email: string; role: Role } | null> {
  const m = await bySetup(token);
  if (!m || checkTotp(m.totp_secret, code) === null) return null;
  await sql()`
    update rr_admin.members set setup_hash = null, setup_expires = null, last_login_at = now()
    where email = ${m.email}`;
  return { email: m.email, role: m.role as Role };
}
