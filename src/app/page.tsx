import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 64 }}>🐰👑</div>
      <h1 style={{ margin: '16px 0 8px' }}>Rabbit Royale</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>The Cursed Crown</p>
      <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
        Dig the island. Read the numbers. Bank the carrots before the volcano takes it all.
      </p>
      <Link href="/play">
        <button style={{ marginTop: 24, padding: '14px 32px', fontSize: 18 }}>Play</button>
      </Link>
    </main>
  );
}
