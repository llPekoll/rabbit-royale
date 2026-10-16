/**
 * The back office's team: who may sign in, and as what.
 *
 * The OWNER is not a row: `ADMIN_OWNER_EMAIL` (yohann.mepa@gmail.com), so no
 * mistake in this table can lock him out. Everyone else is a row of
 * `rr_admin.members`, added by the owner — VIEWER for now: they see the
 * numbers, nothing more. Nothing to send them: they sign in with their email.
 *
 * The rows live in Europe's database, in a schema of their own (`rr_admin`),
 * outside the game's: drizzle never sees it, the game never reads it. This
 * connection is the only one rr-admin opens that can write, and it writes
 * only there.
 */
import postgres from 'postgres';

export type Role = 'owner' | 'viewer';
export const ROLES_GRANTED: Role[] = ['viewer'];

/** The owner's address — and the switch: without it, rr-admin is an agent only. */
export function owner(): string | null {
  const e = process.env.ADMIN_OWNER_EMAIL?.trim().toLowerCase();
  return e ? e : null;
}

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

/** What this address may do now: the owner, a member, or nothing. */
export async function roleOf(email: string): Promise<Role | null> {
  if (email === owner()) return 'owner';
  await ensure();
  const [m] = await sql()`select role from rr_admin.members where email = ${email}`;
  return m && ROLES_GRANTED.includes(m.role) ? (m.role as Role) : null;
}

export async function touchLogin(email: string): Promise<void> {
  if (email === owner()) return;
  await sql()`update rr_admin.members set last_login_at = now() where email = ${email}`;
}

export async function listMembers() {
  await ensure();
  return sql()`select email, role, added_by, added_at, last_login_at from rr_admin.members order by added_at`;
}

/** False when the address is already in. */
export async function addMember(email: string, role: Role, by: string): Promise<boolean> {
  await ensure();
  const rows = await sql()`
    insert into rr_admin.members (email, role, added_by) values (${email}, ${role}, ${by})
    on conflict (email) do nothing returning email`;
  return rows.length > 0;
}

export async function removeMember(email: string): Promise<boolean> {
  await ensure();
  return (await sql()`delete from rr_admin.members where email = ${email} returning email`).length > 0;
}
