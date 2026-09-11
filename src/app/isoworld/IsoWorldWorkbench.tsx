'use client';

/**
 * A Pixi canvas showing one generated island as blocks, plus the knobs.
 *
 * The same page as `/island`, deliberately: same generator, same sliders, same
 * pixelate control, so an island can be judged in both projections by typing
 * the same seed into each. What is new is what a block world needs — ramps
 * between the tiers, and turning the world, because an isometric camera only
 * ever sees two sides of a cliff.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Application, Container } from 'pixi.js';
import { generateIsland } from '@/game/island';
import {
  IsoWorldView,
  loadIsoTileset,
  planIsoWorld,
  rotateIsoWorld,
  type IsoGround,
  type IsoTileset,
} from '@/game/isoworld';
import { Slider, Stat, styles } from '../island/IslandWorkbench';

/** Until the sheet is loaded and its sea colour is known. */
const DEEP_SEA = '#0b2233';

interface Settings {
  seed: string;
  width: number;
  height: number;
  tiers: number;
  land: number;
  rise: number;
  raggedness: number;
  ramps: number;
  stairs: number;
  ground: IsoGround;
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
  ramps: 0.35,
  stairs: 0.3,
  ground: 'tiered',
  deco: true,
};

const randomSeed = () => Math.random().toString(36).slice(2, 8);

/** The blocks are 32px; past 4 an island is mush. */
const MAX_PIXELATE = 4;

export function IsoWorldWorkbench() {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const tilesetRef = useRef<IsoTileset | null>(null);
  const islandRef = useRef<IsoWorldView | null>(null);
  const worldRef = useRef<Container | null>(null);

  const [settings, setSettings] = useState<Settings>(INITIAL);
  const [status, setStatus] = useState('loading the tile sheet...');
  const [stats, setStats] = useState({ cells: 0, land: 0, tiers: 0, ramps: 0, props: 0, sprites: 0 });
  const [sea, setSea] = useState(DEEP_SEA);

  /**
   * How the island is looked at, not what it is — kept out of `Settings` for
   * the same reason `/island` keeps pixelate out: turning the camera must not
   * be mistaken for, or cost, a different island.
   */
  const [pixelate, setPixelate] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [appReady, setAppReady] = useState(false);
  const baseResolution = useRef(1);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const turn = useCallback((by: number) => setRotation((r) => (((r + by) % 4) + 4) % 4), []);

  // Q and E turn the world, as in most isometric builders — but never while
  // the seed box has focus, or typing a seed would spin the island.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'q' || e.key === 'Q') turn(-1);
      if (e.key === 'e' || e.key === 'E') turn(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn]);

  // One application for the life of the page, as on `/island`.
  useEffect(() => {
    let disposed = false;
    const app = new Application();

    (async () => {
      baseResolution.current = Math.min(window.devicePixelRatio || 1, 2);
      await app.init({
        background: DEEP_SEA,
        antialias: false,
        autoDensity: true,
        resizeTo: hostRef.current ?? undefined,
        resolution: baseResolution.current,
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
        tilesetRef.current = await loadIsoTileset();
      } catch (err) {
        setStatus(`the tile sheet failed to load: ${String(err)}`);
        return;
      }
      if (disposed) return;
      // The sea beyond the grid has to be the colour of the sea inside it, or
      // the map's diamond outline shows as a seam in open water.
      app.renderer.background.color = tilesetRef.current.seaColor;
      setSea(`#${tilesetRef.current.seaColor.toString(16).padStart(6, '0')}`);
      setStatus('');
      setAppReady(true);
      setSettings((prev) => ({ ...prev }));
    })();

    return () => {
      disposed = true;
      islandRef.current?.destroy();
      islandRef.current = null;
      appRef.current = null;
      worldRef.current = null;
      setAppReady(false);
      app.destroy(true, { children: true });
    };
  }, []);

  // Pixelate by rendering into fewer pixels — see `/island` for why.
  useEffect(() => {
    const app = appRef.current;
    if (!app || !appReady) return;
    const { width, height } = app.screen;
    app.renderer.resize(width, height, baseResolution.current / pixelate);
  }, [pixelate, appReady]);

  // Rebuild on every settings or rotation change, refit on every resize.
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
    // Planned on the unturned map, THEN turned: the ramps and props belong to
    // the island, so turning the camera must carry them rather than re-roll.
    const planned = planIsoWorld(map, { ramps: settings.ramps, stairs: settings.stairs });
    const island = new IsoWorldView({
      world: rotateIsoWorld(planned, rotation),
      tileset,
      ground: settings.ground,
      deco: settings.deco,
    });
    islandRef.current = island;
    world.addChild(island.view);

    let land = 0;
    for (const level of map.level) if (level > 0) land++;
    setStats({
      cells: map.width * map.height,
      land,
      tiers: map.tiers,
      ramps: planned.ramps.size,
      props: settings.deco ? planned.props.size : 0,
      sprites: island.sprites,
    });

    // Fit the LAND, not the grid: the sea runs on past the grid in the same
    // flat colour, so there is nothing at the margin worth screen space.
    const fit = () => {
      const { width, height } = app.screen;
      const box = island.landBounds;
      let scale = Math.min(width / box.width, height / box.height) * 0.9;
      // Snapped when there is room: 32px pixel art at 1.7x has every other
      // pixel doubled and the outlines wobble. Half steps rather than whole
      // ones, because flooring 1.9 to 1 halves the island for a quarter turn.
      if (scale >= 1) scale = Math.floor(scale * 2) / 2;
      world.scale.set(scale);
      world.position.set(
        Math.round(width / 2 - (box.x + box.width / 2) * scale),
        Math.round(height / 2 - (box.y + box.height / 2) * scale),
      );
    };
    fit();
    app.renderer.on('resize', fit);
    return () => {
      app.renderer.off('resize', fit);
    };
  }, [settings, rotation]);

  return (
    <main style={{ ...styles.page, background: sea }}>
      <div ref={hostRef} style={styles.canvas} />

      <aside style={styles.panel}>
        <h1 style={styles.title}>ISO WORLD WORKBENCH</h1>
        <p style={styles.blurb}>
          The /island generator, stacked in blocks. Ramps climb one tier; turn the world to see the
          cliffs the camera hides.
        </p>

        <label style={styles.row}>
          <span style={styles.label}>seed</span>
          <input style={styles.input} value={settings.seed} onChange={(e) => set('seed', e.target.value)} />
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
        <Slider label="ramps" value={settings.ramps} min={0} max={1} step={0.05} onChange={(v) => set('ramps', v)} />
        <Slider label="stairs" value={settings.stairs} min={0} max={1} step={0.05} onChange={(v) => set('stairs', v)} />

        <label style={styles.row}>
          <span style={styles.label}>ground</span>
          <select
            style={styles.input}
            value={settings.ground}
            onChange={(e) => set('ground', e.target.value as IsoGround)}
          >
            <option value="tiered">tiered</option>
            <option value="grass">grass</option>
            <option value="stone">stone</option>
            <option value="dirt">dirt</option>
          </select>
        </label>

        <label style={styles.row}>
          <span style={styles.label}>deco</span>
          <input type="checkbox" checked={settings.deco} onChange={(e) => set('deco', e.target.checked)} />
        </label>

        {/* View controls: the island is unchanged while these move. */}
        <div style={styles.row}>
          <span style={styles.label}>turn</span>
          <button style={{ ...styles.buttonGhost, flex: 1 }} onClick={() => turn(-1)} title="Q">
            &lt; Q
          </button>
          <button style={{ ...styles.buttonGhost, flex: 1 }} onClick={() => turn(1)} title="E">
            E &gt;
          </button>
        </div>

        <Slider label="pixelate" value={pixelate} min={1} max={MAX_PIXELATE} onChange={setPixelate} />

        <dl style={styles.stats}>
          <Stat label="grid" value={`${settings.width} x ${settings.height}`} />
          <Stat label="land cells" value={`${stats.land} / ${stats.cells}`} />
          <Stat label="tiers drawn" value={String(stats.tiers)} />
          <Stat label="ramps" value={String(stats.ramps)} />
          <Stat label="props" value={String(stats.props)} />
          <Stat label="sprites" value={String(stats.sprites)} />
          <Stat label="facing" value={['north', 'east', 'south', 'west'][rotation]} />
          <Stat label="pixelate" value={pixelate === 1 ? '1:1' : `1 px = ${pixelate}`} />
        </dl>

        {status ? <p style={styles.status}>{status}</p> : null}
      </aside>
    </main>
  );
}
