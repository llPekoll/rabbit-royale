/**
 * THE BACK OFFICE'S NUMBERS (rr-admin) — for ONE region, from what the game already
 * stores. No tracking added for it: every figure below is a query on tables
 * that existed before it (players, runs, raid_runs, payments, purchases,
 * push_tokens).
 *
 * Counts, never rates: the page adds the regions together and divides last,
 * so 3 % of Europe and 50 % of Singapore do not average into nonsense.
 *
 * Every day is a UTC day.
 *
 * WHAT IT CANNOT SEE (said on the page too):
 *  - A guest who never finished a run and stayed away a day is DELETED by the
 *    janitor (lib/auth/abandon), runs included. The bottom of the funnel is
 *    therefore missing from the database, not just low.
 *  - "Active" is "started a run or a raid that day": there is no login log.
 *  - No source, campaign or referral is recorded anywhere.
 */
import { sql } from 'drizzle-orm';
import { db } from './db';

export type Region = 'eu' | 'sg' | 'us' | 'local';

/**
 * Singapore and the US opened on 2026-10-02 with a COPY of Europe's database
 * (game-server-regions). Their accounts created before this instant are
 * Europe's players twice: left out of sign-ups, cohorts and the funnel, kept
 * in activity (a copied account that plays in Singapore does play there).
 */
const COPIED_BEFORE: Record<Region, string> = {
  eu: '1970-01-01T00:00:00Z',
  sg: '2026-10-03T00:00:00Z',
  us: '2026-10-03T00:00:00Z',
  local: '1970-01-01T00:00:00Z',
};

/**
 * Which region this instance reads: `ADMIN_REGION` (eu, sg, us), else the
 * region's own `WS_DOMAIN` (ws-sg.rabbit.rip → sg), else local.
 */
export function regionOf(): Region {
  const r = process.env.ADMIN_REGION as Region | undefined;
  if (r && r in COPIED_BEFORE) return r;
  const m = /^ws-(sg|us)\./.exec(process.env.WS_DOMAIN ?? '');
  return m ? (m[1] as Region) : 'local';
}

type Row = Record<string, unknown>;

async function rows(q: ReturnType<typeof sql>): Promise<Row[]> {
  const r = await db().execute(q);
  return Array.from(r as unknown as Row[]);
}

/** Dates as YYYY-MM-DD, numbers as numbers (Postgres sends bigint/numeric as text). */
function clean(list: Row[]): Row[] {
  return list.map((r) => {
    const o: Row = {};
    for (const [k, v] of Object.entries(r)) {
      if (v instanceof Date) o[k] = v.toISOString().slice(0, 10);
      else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && k !== 'day' && k !== 'platform') o[k] = Number(v);
      else o[k] = v;
    }
    return o;
  });
}

/** Players by how they signed in: a wallet, a Google/email account, or still a guest. */
const KIND = sql`case when p.wallet is not null then 'wallet' when p.id like 'acct:%' then 'account' else 'guest' end`;

/**
 * USD of a confirmed payment: base units over the token's decimals, at the
 * rate the quote was struck at (USDC and SKR 6, SOL 9 — lib/pay/tokens).
 */
const USD = sql`(pay.amount::numeric / power(10, case pay.token when 'sol' then 9 else 6 end)::numeric) * coalesce(nullif(pay.usd_price, '')::numeric, 0)`;

export async function regionMetrics(region: Region, days: number) {
  const cut = COPIED_BEFORE[region];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  // Activity reaches 37 days further back: a month for the first MAU, a week
  // for "reactivated".
  const actFrom = new Date(today.getTime() - (days - 1 + 37) * 86_400_000).toISOString().slice(0, 10);

  /** (player, UTC day) for every day a player started a run or a raid. */
  const ACT = sql`
    select player_id as p, (started_at at time zone 'UTC')::date as d from runs where started_at >= ${actFrom}::date
    union
    select attacker_id, (started_at at time zone 'UTC')::date from raid_runs where started_at >= ${actFrom}::date`;
  const DAYS = sql`select generate_series(${start}::date, (now() at time zone 'UTC')::date, interval '1 day')::date as d`;

  const [signups, active, mix, engagement, raids, revenue, carrotShop, cohorts, funnel, snapshot, levels, push] =
    await Promise.all([
      rows(sql`
        select (p.created_at at time zone 'UTC')::date as day,
          count(*) filter (where ${KIND} = 'guest')::int as guest,
          count(*) filter (where ${KIND} = 'account')::int as account,
          count(*) filter (where ${KIND} = 'wallet')::int as wallet
        from players p
        where p.created_at >= ${cut}::timestamptz and p.created_at >= ${start}::date
        group by 1 order by 1`),
      rows(sql`
        with act as (${ACT}), days as (${DAYS})
        select days.d as day,
          (select count(distinct p) from act where act.d = days.d)::int as dau,
          (select count(distinct p) from act where act.d between days.d - 6 and days.d)::int as wau,
          (select count(distinct p) from act where act.d between days.d - 29 and days.d)::int as mau
        from days order by 1`),
      rows(sql`
        with act as (${ACT})
        select a.d as day,
          count(*) filter (where (p.created_at at time zone 'UTC')::date = a.d)::int as new,
          count(*) filter (where (p.created_at at time zone 'UTC')::date < a.d - 7
            and not exists (select 1 from act b where b.p = a.p and b.d between a.d - 7 and a.d - 1))::int as reactivated,
          count(*)::int as active
        from act a left join players p on p.id = a.p
        where a.d >= ${start}::date
        group by 1 order by 1`),
      rows(sql`
        select (started_at at time zone 'UTC')::date as day,
          count(*)::int as runs,
          count(*) filter (where ended_at is not null)::int as runs_done,
          count(distinct player_id)::int as runners,
          coalesce(sum(duration_ms) filter (where ended_at is not null), 0)::bigint as run_ms
        from runs where started_at >= ${start}::date
        group by 1 order by 1`),
      rows(sql`
        select (started_at at time zone 'UTC')::date as day,
          count(*)::int as raids,
          count(*) filter (where succeeded)::int as raids_won,
          count(distinct attacker_id)::int as raiders
        from raid_runs where started_at >= ${start}::date
        group by 1 order by 1`),
      rows(sql`
        select (pay.confirmed_at at time zone 'UTC')::date as day,
          count(*)::int as payments,
          count(distinct pay.player_id)::int as payers,
          round(sum(${USD}), 2) as usd
        from payments pay
        where pay.status = 'confirmed' and pay.confirmed_at >= ${start}::date
        group by 1 order by 1`),
      rows(sql`
        select (created_at at time zone 'UTC')::date as day, count(*)::int as carrot_buys
        from purchases where currency = 'carrots' and created_at >= ${start}::date
        group by 1 order by 1`),
      rows(sql`
        with act as (${ACT}),
        c as (
          select p.id, p.created_at, (p.created_at at time zone 'UTC')::date as day
          from players p
          where p.created_at >= ${cut}::timestamptz and p.created_at >= ${start}::date
        )
        select c.day,
          count(*)::int as size,
          count(*) filter (where exists (select 1 from runs r where r.player_id = c.id))::int as activated,
          count(*) filter (where exists (select 1 from runs r where r.player_id = c.id
            and r.started_at < c.created_at + interval '24 hours'))::int as activated_24h,
          count(*) filter (where exists (select 1 from act where act.p = c.id and act.d = c.day + 1))::int as d1,
          count(*) filter (where exists (select 1 from act where act.p = c.id and act.d = c.day + 7))::int as d7,
          count(*) filter (where exists (select 1 from act where act.p = c.id and act.d = c.day + 30))::int as d30
        from c group by 1 order by 1`),
      // THE FUNNEL, nested: each step counts the players who took it AND
      // every step before it, so no step can outgrow the one above.
      rows(sql`
        with c as (
          select p.id, p.created_at, p.runs_played, p.level, p.raids_played from players p
          where p.created_at >= ${cut}::timestamptz and p.created_at >= ${start}::date
        ),
        f as (
          select
            exists (select 1 from runs r where r.player_id = c.id) as s1,
            exists (select 1 from runs r where r.player_id = c.id and r.ended_at is not null) as s2,
            c.runs_played >= 3 as s3,
            exists (
              select 1 from runs r where r.player_id = c.id
                and (r.started_at at time zone 'UTC')::date > (c.created_at at time zone 'UTC')::date
              union all
              select 1 from raid_runs rr where rr.attacker_id = c.id
                and (rr.started_at at time zone 'UTC')::date > (c.created_at at time zone 'UTC')::date) as s4,
            c.level >= 2 as s5,
            c.level >= 3 as s6,
            c.raids_played > 0 as s7,
            exists (select 1 from push_tokens t where t.player_id = c.id) as s8,
            exists (select 1 from payments pay where pay.player_id = c.id and pay.status = 'confirmed') as s9
          from c
        )
        select
          count(*)::int as signed_up,
          count(*) filter (where s1)::int as first_run,
          count(*) filter (where s1 and s2)::int as run_finished,
          count(*) filter (where s1 and s2 and s3)::int as three_runs,
          count(*) filter (where s1 and s2 and s3 and s4)::int as came_back,
          count(*) filter (where s1 and s2 and s3 and s4 and s5)::int as level_2,
          count(*) filter (where s1 and s2 and s3 and s4 and s5 and s6)::int as level_3,
          count(*) filter (where s1 and s2 and s3 and s4 and s5 and s6 and s7)::int as first_raid,
          count(*) filter (where s1 and s2 and s3 and s4 and s5 and s6 and s7 and s8)::int as push_opt_in,
          count(*) filter (where s1 and s2 and s3 and s4 and s5 and s6 and s7 and s8 and s9)::int as paid,
          count(*) filter (where s9)::int as paid_any
        from f`),
      rows(sql`
        select
          count(*) filter (where p.created_at >= ${cut}::timestamptz)::int as players,
          count(*) filter (where p.created_at < ${cut}::timestamptz)::int as copied,
          count(*) filter (where p.created_at >= ${cut}::timestamptz and ${KIND} = 'guest')::int as guests,
          count(*) filter (where p.created_at >= ${cut}::timestamptz and ${KIND} = 'account')::int as accounts,
          count(*) filter (where p.created_at >= ${cut}::timestamptz and ${KIND} = 'wallet')::int as wallets,
          count(*) filter (where p.last_seen_at > now() - interval '1 day')::int as seen_1d,
          count(*) filter (where p.last_seen_at > now() - interval '7 days')::int as seen_7d,
          count(*) filter (where p.last_seen_at > now() - interval '30 days')::int as seen_30d,
          min(p.created_at) filter (where p.created_at >= ${cut}::timestamptz) as first_signup,
          (select round(coalesce(sum(${USD}), 0), 2) from payments pay where pay.status = 'confirmed') as usd_all_time,
          (select count(distinct player_id)::int from payments pay where pay.status = 'confirmed') as payers_all_time
        from players p`),
      rows(sql`
        select level, count(*)::int as players from players
        where created_at >= ${cut}::timestamptz group by 1 order by 1`),
      rows(sql`
        select platform, count(distinct player_id)::int as players from push_tokens group by 1 order by 2 desc`),
    ]);

  const snap = clean(snapshot)[0] ?? {};

  return {
    region,
    days,
    start,
    generatedAt: new Date().toISOString(),
    copiedBefore: cut,
    daily: {
      signups: clean(signups),
      active: clean(active),
      mix: clean(mix),
      engagement: clean(engagement),
      raids: clean(raids),
      revenue: clean(revenue),
      carrotShop: clean(carrotShop),
    },
    cohorts: clean(cohorts),
    funnel: clean(funnel)[0] ?? {},
    snapshot: snap,
    levels: clean(levels),
    push: clean(push),
  };
}
