-- THE THREE REGIONS INTO ONE DATABASE (2026-10-23).
--
-- Run INSIDE the EU database, with the Singapore and US databases restored
-- beside it as the schemas `sg` and `us` (scripts/merge-regions.sh does that).
-- EU's `public` is the target.
--
--   psql -v ON_ERROR_STOP=1 -v commit=0 -f scripts/merge-regions.sql   # rehearsal: report, then ROLLBACK
--   psql -v ON_ERROR_STOP=1 -v commit=1 -f scripts/merge-regions.sql   # the real thing
--
-- ONE ACCOUNT, SEVERAL COPIES. Singapore and the US started as copies of
-- Europe (2026-10-02), with the same JWT, so a wallet account and an old
-- guest exist in two or three regions under the SAME id — and may have
-- played in more than one since. Copies are the same account when they share
-- an id, or a wallet (a guest who linked a wallet in one region, a `sol:` id
-- for that wallet in another: wallet login finds either, so they cannot both
-- survive).
--
-- WHICH COPY IS KEPT (decided by the user, 2026-10-23): the MOST ADVANCED —
-- rabbit level, then burrow level, then carrots ever earned (never spent,
-- never stolen, so it grows with every game) — and, between copies that are
-- level, the one played LAST. Nobody loses what they earned. The kept copy
-- carries the account's first creation date and its latest connection.
--
-- WHAT THE OTHER COPIES STILL GIVE:
--  - everything PAID is kept: skins, payments, purchases, Crown Race tickets,
--    Genesis pieces — whichever copy they were bought on;
--  - HISTORY is kept: games, raids (both sides), sabotages, standings;
--  - every device's push token, so a phone still hears from the game.
-- What goes with them: their burrow (bag, bombs, planks, stumps), energy,
-- snack streak and push timers — those belong to the copy that is kept.
--
-- SAFE BY CONSTRUCTION: one transaction; any surprise (a table this file
-- does not know, an account with two wallets, columns that differ between
-- regions, a row that would collide) aborts it and nothing has changed.

\set ON_ERROR_STOP on
begin;

-- Every copy of every account, and when it was last there. `online_at` is
-- the socket's last sighting, fresher than `last_seen_at` (a sign-in).
create temp table copies as
  select c.region, p.id, p.wallet, p.name, p.level, p.burrow_level, p.lifetime_carrots, p.created_at, p.last_seen_at,
         greatest(p.last_seen_at, coalesce(c.online_at, p.last_seen_at)) as active
  from (
    select 'eu' as region, p.id, ps.online_at from public.players p left join public.push_state ps on ps.player_id = p.id
    union all select 'sg', p.id, ps.online_at from sg.players p left join sg.push_state ps on ps.player_id = p.id
    union all select 'us', p.id, ps.online_at from us.players p left join us.push_state ps on ps.player_id = p.id
  ) c
  join lateral (
    select * from public.players where c.region = 'eu' and id = c.id
    union all select * from sg.players where c.region = 'sg' and id = c.id
    union all select * from us.players where c.region = 'us' and id = c.id
  ) p on true;

-- WHAT TIES TWO IDS TOGETHER: a wallet, or a sign-in (Google, an email
-- code) — the WEB2 world has no wallets, and its regions did not start as
-- copies: one Google account signed into Singapore and Europe holds two ids,
-- and once the regions share a database only one of them can answer that
-- sign-in. Everything tied, directly or through a chain, is one account.
create temp table ties as
  select id, 'wallet:' || wallet as tie from copies where wallet is not null
  union
  select player_id, provider || ':' || subject from (
    select player_id, provider::text, subject from public.player_identities
    union all select player_id, provider::text, subject from sg.player_identities
    union all select player_id, provider::text, subject from us.player_identities
  ) i;

alter table copies add column account text;
update copies set account = id;
-- Each id takes the smallest id it is tied to, until nothing moves.
do $$
declare moved int;
begin
  loop
    with reach as (
      select t1.id, min(c.account) as account
      from ties t1 join ties t2 using (tie) join copies c on c.id = t2.id
      group by t1.id
    )
    update copies c set account = r.account from reach r
    where c.id = r.id and r.account < c.account;
    get diagnostics moved = row_count;
    exit when moved = 0;
  end loop;
end $$;

-- One account, one wallet: two would leave a wallet login with two answers.
do $$
declare bad text;
begin
  select string_agg(account, ', ') into bad from (
    select account from copies where wallet is not null group by account having count(distinct wallet) > 1
  ) x;
  if bad is not null then raise exception 'accounts with two different wallets across regions: %', bad; end if;
end $$;

-- The copy kept for each account.
create temp table winners as
  select distinct on (account) account, region, id
  from copies
  order by account, level desc, burrow_level desc, lifetime_carrots desc, active desc, (region = 'eu') desc;

-- Every copy → the id it becomes, and whether it is the kept one.
create temp table alias as
  select c.region, c.id as from_id, w.id as to_id, w.region as win_region,
         (c.region = w.region and c.id = w.id) as kept
  from copies c join winners w using (account);
create unique index on alias (region, from_id);

-- ── What the file knows ──────────────────────────────────────────────────
-- Each table pointing at players, and how a merge treats it. A table added
-- since stops the merge here, until someone decides.
create temp table policy (tbl text primary key, kind text not null);
insert into policy values
  -- the kept copy's only
  ('inventory', 'owned'), ('traps', 'owned'), ('fences', 'owned'), ('burrow_cuts', 'owned'),
  ('push_state', 'owned'), ('snack_streak', 'owned'),
  -- every copy's, once
  ('payments', 'union'), ('purchases', 'union'), ('player_skins', 'union'), ('genesis_pieces', 'union'),
  ('season_passes', 'union'), ('pass_payouts', 'union'), ('season_standings', 'union'),
  ('runs', 'union'), ('raids', 'union'), ('raid_runs', 'union'), ('sabotages', 'union'),
  ('player_identities', 'union'), ('push_tokens', 'union'),
  -- sign-ins in flight: the servers are stopped, nothing to carry
  ('auth_handoffs', 'skip'), ('email_codes', 'skip'),
  -- the same rows in every region (checked below)
  ('seasons', 'same');
-- The column naming the OWNER of an 'owned' row.
create temp table owner_col (tbl text primary key, col text not null);
insert into owner_col values ('inventory', 'player_id'), ('traps', 'owner_id'), ('fences', 'owner_id'),
  ('burrow_cuts', 'owner_id'), ('push_state', 'player_id'), ('snack_streak', 'player_id');

-- Columns that hold a player id, from the foreign keys themselves.
create temp table player_cols as
  select c.conrelid::regclass::text as tbl, a.attname::text as col
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.contype = 'f' and c.confrelid = 'public.players'::regclass;

do $$
declare bad text;
begin
  select string_agg(distinct tbl, ', ') into bad from player_cols where tbl not in (select tbl from policy);
  if bad is not null then raise exception 'tables pointing at players that this merge does not know: %', bad; end if;
end $$;

-- The same columns, of the same types, in every region: the schemas were
-- migrated by the same files, and a region left behind must not be merged.
do $$
declare bad text;
begin
  select string_agg(format('%s.%s.%s', s.table_schema, s.table_name, s.column_name), ', ') into bad
  from information_schema.columns s
  where s.table_schema in ('sg', 'us')
    and not exists (select 1 from information_schema.columns p
                    where p.table_schema = 'public' and p.table_name = s.table_name
                      and p.column_name = s.column_name and p.udt_name = s.udt_name);
  if bad is not null then raise exception 'columns that differ from europe: %', bad; end if;
  select string_agg(format('%s.%s', p.table_name, p.column_name), ', ') into bad
  from information_schema.columns p
  join information_schema.tables t on t.table_schema = 'public' and t.table_name = p.table_name and t.table_type = 'BASE TABLE'
  where p.table_schema = 'public' and p.table_name in (select table_name from information_schema.tables where table_schema = 'sg')
    and (not exists (select 1 from information_schema.columns s where s.table_schema = 'sg' and s.table_name = p.table_name and s.column_name = p.column_name)
      or not exists (select 1 from information_schema.columns s where s.table_schema = 'us' and s.table_name = p.table_name and s.column_name = p.column_name));
  if bad is not null then raise exception 'columns missing in sg or us: %', bad; end if;
end $$;

do $$
begin
  if exists (select * from sg.seasons except select * from public.seasons)
     or exists (select * from us.seasons except select * from public.seasons)
     or (select count(*) from public.seasons) <> (select count(*) from sg.seasons)
     or (select count(*) from public.seasons) <> (select count(*) from us.seasons) then
    raise exception 'the seasons differ between regions';
  end if;
end $$;

-- ── Helpers ──────────────────────────────────────────────────────────────
-- The SELECT list copying a table from `src` into public: enums cast across
-- schemas, player ids sent through the alias.
create function pg_temp.select_list(src text, tbl text) returns text language sql as $$
  select string_agg(
    case
      when exists (select 1 from player_cols pc where pc.tbl = $2 and pc.col = c.column_name)
        then format('coalesce((select a.to_id from alias a where a.region = %L and a.from_id = x.%I), x.%I)', $1, c.column_name, c.column_name)
      when c.data_type = 'USER-DEFINED'
        then format('x.%I::text::public.%I', c.column_name, c.udt_name)
      else format('x.%I', c.column_name)
    end, ', ' order by c.ordinal_position)
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = $2
$$;
create function pg_temp.column_list(tbl text) returns text language sql as $$
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  from information_schema.columns where table_schema = 'public' and table_name = $1
$$;

-- ── Diagnostics, before anything moves ───────────────────────────────────
-- A row with the same id in two regions is a row from before the copy. It
-- should be identical; one that is not changed in a region after the copy,
-- and the region where it lands first (Europe) wins. Counted, so a surprise
-- shows in the report.
create temp table diverged (tbl text, region text, n bigint);
do $$
declare t text; r text; n bigint;
begin
  foreach t in array array['runs', 'raids', 'raid_runs', 'sabotages', 'purchases', 'payments', 'genesis_pieces', 'burrow_cuts'] loop
    foreach r in array array['sg', 'us'] loop
      execute format('select count(*) from %I.%I src_row join public.%I dst_row using (id) where to_jsonb(src_row) <> to_jsonb(dst_row)', r, t, t) into n;
      if n > 0 then insert into diverged values (t, r, n); end if;
    end loop;
  end loop;
end $$;

-- ── 1. The accounts ──────────────────────────────────────────────────────
-- A copy that is not kept gives up its wallet first: the kept copy may carry
-- the same one under another id, and the wallet index is unique.
update public.players p set wallet = null
from alias a where a.region = 'eu' and a.from_id = p.id and not a.kept and p.wallet is not null;

-- Kept copies from Singapore / the US: a new row, or written over Europe's
-- copy of the same id.
do $$
declare r text; cols text := pg_temp.column_list('players');
begin
  foreach r in array array['sg', 'us'] loop
    execute format(
      'update public.players p set (%s) = (select %s from %I.players x where x.id = p.id)
       where p.id in (select from_id from alias where region = %L and kept)',
      cols, pg_temp.select_list(r, 'players'), r, r);
    execute format(
      'insert into public.players (%s) select %s from %I.players x
       where x.id in (select from_id from alias where region = %L and kept)
         and not exists (select 1 from public.players p where p.id = x.id)',
      cols, pg_temp.select_list(r, 'players'), r, r);
  end loop;
end $$;

-- The account's first day and its LAST connection, whichever copy saw them.
update public.players p set created_at = s.created_at, last_seen_at = s.last_seen_at
from (select a.to_id, min(c.created_at) as created_at, max(c.last_seen_at) as last_seen_at
      from alias a join copies c on c.region = a.region and c.id = a.from_id group by a.to_id) s
where p.id = s.to_id;

-- ── 2. Europe's own rows ─────────────────────────────────────────────────
-- Owned rows of a copy that is not kept go (the kept copy's come in below).
do $$
declare o record;
begin
  for o in select * from owner_col loop
    execute format('delete from public.%I t using alias a where a.region = ''eu'' and a.from_id = t.%I and not a.kept', o.tbl, o.col);
  end loop;
end $$;

-- Rows pointing at a European copy folded into ANOTHER id now point at the
-- kept one. (An id kept elsewhere keeps its id: nothing to rewrite.)
do $$
declare pc record;
begin
  for pc in select * from player_cols where tbl in (select tbl from policy where kind in ('union', 'owned')) or tbl = 'seasons' loop
    execute format('update public.%I t set %I = a.to_id from alias a where a.region = ''eu'' and a.from_id = t.%I and a.to_id <> a.from_id', pc.tbl, pc.col, pc.col);
  end loop;
end $$;
delete from public.auth_handoffs t using alias a where a.region = 'eu' and a.from_id = t.player_id and a.to_id <> a.from_id;
delete from public.email_codes t using alias a where a.region = 'eu' and a.from_id = t.player_id and a.to_id <> a.from_id;
delete from public.players p using alias a where a.region = 'eu' and a.from_id = p.id and a.to_id <> a.from_id;

-- ── 3. Singapore's and the US's rows ─────────────────────────────────────
-- A raid left open by a copy that is not kept is over: the kept copy is
-- where that player stands now. (`sg` and `us` are the dumps restored for
-- the merge, not the regions' databases: closing a row there is free.)
update public.raid_runs set ended_at = now()
where ended_at is null and attacker_id in (select from_id from alias where region = 'eu' and not kept);
update sg.raid_runs set ended_at = now()
where ended_at is null and attacker_id in (select from_id from alias where region = 'sg' and not kept);
update us.raid_runs set ended_at = now()
where ended_at is null and attacker_id in (select from_id from alias where region = 'us' and not kept);

create temp table carried (tbl text, region text, n bigint);
do $$
declare r text; t text; n bigint; cols text; filter text;
begin
  foreach r in array array['sg', 'us'] loop
    -- payments before what points at them, runs before Genesis pieces.
    foreach t in array array['payments', 'purchases', 'player_skins', 'season_passes', 'pass_payouts', 'season_standings',
                             'runs', 'genesis_pieces', 'raids', 'raid_runs', 'sabotages', 'player_identities',
                             'inventory', 'traps', 'fences', 'burrow_cuts', 'push_state', 'snack_streak'] loop
      cols := pg_temp.column_list(t);
      filter := 'true';
      if (select kind from policy where tbl = t) = 'owned' then
        filter := format('x.%I in (select from_id from alias where region = %L and kept)', (select col from owner_col where tbl = t), r);
      end if;
      execute format('insert into public.%I (%s) select %s from %I.%I x where %s on conflict do nothing',
                     t, cols, pg_temp.select_list(r, t), r, t, filter);
      get diagnostics n = row_count;
      insert into carried values (t, r, n);
    end loop;
    -- One row per device: the token as it stood most recently.
    execute format(
      'insert into public.push_tokens (%s) select %s from %I.push_tokens x
       on conflict (token) do update set player_id = excluded.player_id, platform = excluded.platform,
         locale = excluded.locale, tz_offset_min = excluded.tz_offset_min, updated_at = excluded.updated_at
       where excluded.updated_at > push_tokens.updated_at',
      pg_temp.column_list('push_tokens'), pg_temp.select_list(r, 'push_tokens'), r);
    get diagnostics n = row_count;
    insert into carried values ('push_tokens', r, n);
  end loop;
end $$;

-- ── Report ───────────────────────────────────────────────────────────────
\echo
\echo '== accounts'
select (select count(*) from copies) as copies, (select count(*) from winners) as accounts,
       (select count(*) from public.players) as players_after;
\echo '== kept copy, by region'
select region, count(*) from winners group by region order by region;
\echo '== accounts played in more than one region since the copy (2026-10-02)'
select left(c.name, 16) as name, c.region, c.level as lv, c.burrow_level as burrow, c.lifetime_carrots as carrots_ever,
       c.active::date as last_there, case when a.kept then 'KEPT' else '' end as kept
from copies c join alias a on a.region = c.region and a.from_id = c.id
where a.to_id in (select to_id from alias a2 join copies c2 on c2.region = a2.region and c2.id = a2.from_id
                  where c2.active > '2026-10-03' group by to_id having count(*) > 1)
order by a.to_id, a.kept desc, c.active desc;
\echo '== the kept copy is not the one played last'
select left(l.name, 16) as name, k.region as kept_in, k.active::date as kept_last_there,
       l.region as played_last_in, l.active::date as played_last
from (select distinct on (a.to_id) a.to_id, c.* from alias a join copies c on c.region = a.region and c.id = a.from_id
      order by a.to_id, c.active desc) l
join alias w on w.to_id = l.to_id and w.kept
join copies k on k.region = w.region and k.id = w.from_id
where l.active > k.active
order by l.active desc;
\echo '== accounts folded into another id (same wallet or sign-in)'
select region, from_id, to_id from alias where to_id <> from_id;
\echo '== rows carried from sg / us'
select tbl, region, n from carried where n > 0 order by tbl, region;
\echo '== rows changed in a region after the copy (Europe''s version kept)'
select * from diverged;

select case when :commit = 1 then 'commit' else 'rollback' end as ending \gset
\echo '== ending:' :ending
:ending;
