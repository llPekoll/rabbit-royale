/**
 * "You were raided", summed from the history's unread raids.
 *
 * The stamp is shown once and never again for the same news, so a wrong sum
 * is a wrong story told exactly once — nobody gets a second look to notice.
 * Pinned: only the UNREAD head counts, names are not repeated, and a night of
 * raids that all bounced off a shield is good news, not bad.
 */
import { describe, expect, it } from 'vitest';
import { raidedNews } from '../src/components/raided-stamp';

const row = (otherName: string, carrotsLooted: number, result = 'looted') => ({ otherName, carrotsLooted, result });

describe('raided while away', () => {
  it('says nothing when every raid has been read', () => {
    expect(raidedNews({ against: [row('Bob', 40)], unseen: 0 })).toBeNull();
    expect(raidedNews(null)).toBeNull();
    expect(raidedNews({ against: [], unseen: 3 })).toBeNull();
  });

  it('counts only the unread head of the list, newest first', () => {
    const news = raidedNews({ against: [row('Ann', 30), row('Bob', 20), row('Old', 999)], unseen: 2 });
    expect(news).toEqual({ by: 'Ann', others: 1, carrots: 50, defended: false, count: 2 });
  });

  it('names a raider who came twice once', () => {
    const news = raidedNews({ against: [row('Ann', 10), row('Ann', 15)], unseen: 2 });
    expect(news?.others).toBe(0);
    expect(news?.carrots).toBe(25);
  });

  it('reports a night of blocked raids as defended', () => {
    const news = raidedNews({ against: [row('Ann', 0, 'blocked'), row('Bob', 0, 'blocked')], unseen: 2 });
    expect(news?.defended).toBe(true);
    expect(raidedNews({ against: [row('Ann', 0, 'blocked'), row('Bob', 12)], unseen: 2 })?.defended).toBe(false);
  });
});
