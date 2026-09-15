'use client';

/**
 * "You were raided" — over the screen, once, when the burrow is first seen
 * with unread raids against it. See page.tsx `raided`.
 *
 * The level-up stamp's grammar (one stamp for "something happened to your
 * burrow") in the danger red. When every unread raid bounced off a shield the
 * news is good, and says so in gold instead: DEFENDED.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/** How long the stamp stays, matched to the CSS (`.rr-raided` out delay + run). */
const STAMP_MS = 2600;

export interface RaidedNews {
  /** The most recent raider's name. */
  by: string;
  /** How many OTHER raiders came too. */
  others: number;
  /** Carrots taken across the unread raids. */
  carrots: number;
  /** Whether every unread raid was blocked. */
  defended: boolean;
  /** How many unread raids. */
  count: number;
}

interface RaidRowLike {
  otherName: string;
  carrotsLooted: number;
  result: string;
}

/**
 * The unread raids, summed into one line of news — or null when there are
 * none. `against` comes newest first from /api/player/history, so the unread
 * ones are its head.
 */
export function raidedNews(raids: { against?: RaidRowLike[]; unseen?: number } | null | undefined): RaidedNews | null {
  const unseen = raids?.unseen ?? 0;
  const rows = (raids?.against ?? []).slice(0, unseen);
  if (!unseen || rows.length === 0) return null;
  const names = [...new Set(rows.map((r) => r.otherName))];
  return {
    by: names[0],
    others: names.length - 1,
    carrots: rows.reduce((n, r) => n + (r.carrotsLooted ?? 0), 0),
    defended: rows.every((r) => r.result === 'blocked'),
    count: rows.length,
  };
}

export function RaidedStamp({ news, onDone }: { news: RaidedNews; onDone(): void }) {
  useEffect(() => {
    const t = setTimeout(onDone, STAMP_MS);
    return () => clearTimeout(t);
    // Shown once per piece of news; a new callback identity must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const who = news.others > 0 ? `${news.by} +${news.others}` : news.by;
  return createPortal(
    <div className={`rr-levelup rr-raided${news.defended ? ' defended' : ''}`} role="status" aria-live="polite">
      <div className="rr-levelup-flash" />
      <div className="rr-levelup-stamp">
        {news.defended ? 'DEFENDED' : 'RAIDED'}
        <small>
          {news.defended
            ? `${news.count} RAID${news.count === 1 ? '' : 'S'} BOUNCED OFF`
            : <>BY {who.toUpperCase()}{news.carrots > 0 && <> &middot; -{news.carrots} CARROTS</>}</>}
        </small>
      </div>
    </div>,
    document.body,
  );
}
