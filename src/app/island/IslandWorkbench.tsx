'use client';

/**
 * A Pixi canvas showing one generated island, plus the knobs that made it.
 *
 * Rebuilds the whole island whenever a control changes, which is cheap: the
 * sheets are loaded once and every tile is a slice of them, so a rebuild is a
 * few thousand sprites and no texture uploads at all. The camera fits the map
 * to the canvas rather than scrolling it, because the thing under review is the
 * SHAPE of an island, and that is only judgeable whole.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Application, Container } from 'pixi.js';
import { generateIsland, IslandView, loadIslandTileset, TILE, type GroundKind, type IslandTileset } from '@/game/island';

/** Open sea, so the canvas outside the island matches the water tile. */
const SEA = '#0d8296';

interface Settings {
  seed: string;
  width: number;
  height: number;
  tiers: number;
  land: number;
  rise: number;
  raggedness: number;
  ground: 'tiered' | GroundKind;
  deco: boolean;
}

const INITIAL: Settings = {
  seed: 'harbour-9',
  width: 34,
  height: 24,
  tiers: 3,
  land: 0.46,
  rise: 0.55,
  raggedness: 0.4,
  ground: 'tiered',
  deco: true,
};

const randomSeed = () => Math.random().toString(36).slice(2, 8);

export function IslandWorkbench() {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const tilesetRef = useRef<IslandTileset | null>(null);
  const islandRef = useRef<IslandView | null>(null);
  const worldRef = useRef<Container | null>(null);

  const [settings, setSettings] = useState<Settings>(INITIAL);
  const [status, setStatus] = useState('loading the tile sheets...');
  const [stats, setStats] = useState({ cells: 0, land: 0, tiers: 0 });

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  // One application for the life of the page. Tearing it down per rebuild would
  // drop the WebGL context and re-upload every sheet on each slider nudge.
  useEffect(() => {
    let disposed = false;
    const app = new Application();

    (async () => {
      await app.init({
        background: SEA,
        antialias: false,
        autoDensity: true,
        resizeTo: hostRef.current ?? undefined,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }
      appRef.current = app;
      hostRef.current?.appendChild(app.canvas);
      app.canvas.style.imageRendering = 'pixelated';

      const world = new Container();
      app.stage.addChild(world);
      worldRef.current = world;

      try {
        tilesetRef.current = await loadIslandTileset();
      } catch (err) {
        setStatus(`the tile sheets failed to load: ${String(err)}`);
        return;
      }
      if (disposed) return;
      setStatus('');
      // Nudge the build effect now that the sheets exist.
      setSettings((prev) => ({ ...prev }));

      app.ticker.add((ticker) => islandRef.current?.update(ticker.deltaMS));
    })();

    return () => {
      disposed = true;
      islandRef.current?.destroy();
      islandRef.current = null;
      appRef.current = null;
      worldRef.current = null;
      app.destroy(true, { children: true });
    };
  }, []);

  // Rebuild on every settings change, and refit whenever the canvas resizes.
  useEffect(() => {
    const app = appRef.current;
    const world = worldRef.current;
    const tileset = tilesetRef.current;
    if (!app || !world || !tileset) return;

    islandRef.current?.destroy();
    const map = generateIsland({
      seed: settings.seed,
      width: settings.width,
      height: settings.height,
      tiers: settings.tiers,
      land: settings.land,
      rise: settings.rise,
      raggedness: settings.raggedness,
    });
    const island = new IslandView({
      map,
      tileset,
      ground: settings.ground,
      deco: settings.deco,
    });
    islandRef.current = island;
    world.addChild(island.view);

    let land = 0;
    for (const level of map.level) if (level > 0) land++;
    setStats({ cells: map.width * map.height, land, tiers: map.tiers });

    const fit = () => {
      const { width, height } = app.screen;
      const scale = Math.min(width / island.width, height / island.height);
      world.scale.set(scale);
      world.position.set((width - island.width * scale) / 2, (height - island.height * scale) / 2);
    };
    fit();
    app.renderer.on('resize', fit);
    return () => {
      app.renderer.off('resize', fit);
    };
  }, [settings]);

  return (
    <main style={styles.page}>
      <div ref={hostRef} style={styles.canvas} />

      <aside style={styles.panel}>
        <h1 style={styles.title}>ISLAND WORKBENCH</h1>
        <p style={styles.blurb}>
          Tiny Swords terrain, autotiled. Grass sits on a rock shelf; the shelf&apos;s rim and its
          cliff face are what make a plateau read as raised.
        </p>

        <label style={styles.row}>
          <span style={styles.label}>seed</span>
          <input
            style={styles.input}
            value={settings.seed}
            onChange={(e) => set('seed', e.target.value)}
          />
        </label>

        <button style={styles.button} onClick={() => set('seed', randomSeed())}>
          NEW ISLAND
        </button>

        <Slider label="width" value={settings.width} min={12} max={60} onChange={(v) => set('width', v)} />
        <Slider label="height" value={settings.height} min={10} max={44} onChange={(v) => set('height', v)} />
        <Slider label="tiers" value={settings.tiers} min={1} max={5} onChange={(v) => set('tiers', v)} />
        <Slider label="land" value={settings.land} min={0.15} max={0.85} step={0.01} onChange={(v) => set('land', v)} />
        <Slider label="rise" value={settings.rise} min={0.1} max={0.9} step={0.01} onChange={(v) => set('rise', v)} />
        <Slider
          label="ragged"
          value={settings.raggedness}
          min={0}
          max={1}
          step={0.02}
          onChange={(v) => set('raggedness', v)}
        />

        <label style={styles.row}>
          <span style={styles.label}>ground</span>
          <select
            style={styles.input}
            value={settings.ground}
            onChange={(e) => set('ground', e.target.value as Settings['ground'])}
          >
            <option value="tiered">tiered</option>
            <option value="grass">grass</option>
            <option value="sand">sand</option>
          </select>
        </label>

        <label style={styles.row}>
          <span style={styles.label}>deco</span>
          <input
            type="checkbox"
            checked={settings.deco}
            onChange={(e) => set('deco', e.target.checked)}
          />
        </label>

        <dl style={styles.stats}>
          <Stat label="grid" value={`${settings.width} x ${settings.height}`} />
          <Stat label="pixels" value={`${settings.width * TILE} x ${settings.height * TILE}`} />
          <Stat label="land cells" value={`${stats.land} / ${stats.cells}`} />
          <Stat label="tiers drawn" value={String(stats.tiers)} />
        </dl>

        {status ? <p style={styles.status}>{status}</p> : null}
      </aside>
    </main>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={styles.row}>
      <span style={styles.label}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={styles.range}
      />
      <span style={styles.value}>{value}</span>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={styles.statLabel}>{label}</dt>
      <dd style={styles.statValue}>{value}</dd>
    </>
  );
}

// Inline objects rather than a stylesheet: this page is a workbench, and every
// rule it needs is on screen here. `CSSProperties`, never `as const` — a
// readonly literal spread into `style` fails the production build.
const styles: Record<string, React.CSSProperties> = {
  page: { position: 'fixed', inset: 0, display: 'flex', background: SEA, color: '#e8f6f8' },
  canvas: { flex: 1, minWidth: 0, lineHeight: 0 },
  panel: {
    width: 264,
    flexShrink: 0,
    padding: '18px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    overflowY: 'auto',
    background: '#12303a',
    borderLeft: '2px solid #0a1e26',
    font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  title: { margin: 0, fontSize: 13, letterSpacing: 2, fontWeight: 700 },
  blurb: { margin: '0 0 6px', fontSize: 11, lineHeight: 1.6, color: '#8fb9c4' },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  label: { width: 64, flexShrink: 0, color: '#8fb9c4' },
  value: { width: 34, textAlign: 'right', color: '#cfe9ef' },
  input: {
    flex: 1,
    minWidth: 0,
    padding: '5px 7px',
    background: '#0a1e26',
    border: '1px solid #24505e',
    borderRadius: 3,
    color: '#e8f6f8',
    font: 'inherit',
  },
  range: { flex: 1, minWidth: 0, accentColor: '#5fd0c2' },
  button: {
    padding: '7px 10px',
    background: '#5fd0c2',
    border: 0,
    borderRadius: 3,
    color: '#08222a',
    font: 'inherit',
    fontWeight: 700,
    letterSpacing: 1,
    cursor: 'pointer',
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '2px 10px',
    margin: '8px 0 0',
    paddingTop: 10,
    borderTop: '1px solid #24505e',
  },
  statLabel: { margin: 0, color: '#8fb9c4' },
  statValue: { margin: 0, textAlign: 'right', color: '#cfe9ef' },
  status: { margin: 0, color: '#ffd479', fontSize: 11 },
};
