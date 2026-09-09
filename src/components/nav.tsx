'use client';

/**
 * The game's bottom navigation.
 *
 * Bottom, not top: this is played one-handed on a phone, and the reachable
 * third of the screen is the bottom one. Three destinations is the whole app —
 * the run, the burrow you spend in, and the board you measure yourself against.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/play', label: 'Island', icon: '🏝️' },
  { href: '/burrow', label: 'Burrow', icon: '🕳️' },
  { href: '/leaderboard', label: 'Crown', icon: '👑' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="rr-nav">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={path === t.href ? 'active' : ''}>
          <span aria-hidden>{t.icon}</span>
          <small>{t.label}</small>
        </Link>
      ))}
    </nav>
  );
}
