'use client';

/**
 * Isometric renderer, canvas 2D.
 *
 * Placeholder art on purpose: the BUILD-PLAN says to reuse the existing Rabbit
 * Royale assets and island engine when that repo is available, and until then
 * anything more elaborate is work thrown away. What matters at this stage is
 * that the READ is right — a player must be able to tell a 3 from a 1 at a
 * glance, because "is reading the numbers satisfying?" is phase 1's whole
 * playtest question.
 */
import { useEffect, useRef } from 'react';
import type { ClientIsland, ClientRabbit } from './use-game-socket';

const TILE_W = 56;
const TILE_H = 28;

/** Minesweeper's classic hint colours — learned muscle memory, so kept. */
const HINT_COLORS = ['', '#4aa3ff', '#3ecf7f', '#ff6b6b', '#b46bff', '#ffb03a', '#3ecfcf', '#dddddd', '#888888'];

export function IslandCanvas({
  island,
  rabbits,
  meId,
  warnStage,
}: {
  island: ClientIsland;
  rabbits: Map<string, ClientRabbit>;
  meId: string | null;
  warnStage: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = (island.width + island.height) * (TILE_W / 2) + TILE_W;
    const h = (island.width + island.height) * (TILE_H / 2) + TILE_H * 6;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const originX = island.height * (TILE_W / 2);
    const originY = TILE_H * 3;
    const iso = (x: number, y: number) => ({
      sx: originX + (x - y) * (TILE_W / 2),
      sy: originY + (x + y) * (TILE_H / 2),
    });

    const diamond = (sx: number, sy: number, fill: string, stroke: string) => {
      ctx.beginPath();
      ctx.moveTo(sx, sy - TILE_H / 2);
      ctx.lineTo(sx + TILE_W / 2, sy);
      ctx.lineTo(sx, sy + TILE_H / 2);
      ctx.lineTo(sx - TILE_W / 2, sy);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    // Painter's order: back rows first, so rabbits in front overlap correctly.
    for (let y = 0; y < island.height; y++) {
      for (let x = 0; x < island.width; x++) {
        const tile = island.tiles[y * island.width + x];
        const { sx, sy } = iso(x, y);

        if (!tile.revealed) {
          // Undug ground. The subtle checker keeps a big field of it readable.
          diamond(sx, sy, (x + y) % 2 ? '#2f6b3a' : '#2a6034', '#1e4526');
          continue;
        }

        diamond(sx, sy, '#6b5138', '#4a3826');

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (tile.content === 'bomb') {
          ctx.font = '18px system-ui';
          ctx.fillText('💣', sx, sy);
        } else if (tile.content === 'carrot') {
          ctx.font = '16px system-ui';
          ctx.fillText('🥕', sx, sy);
        } else if (tile.content === 'golden') {
          ctx.font = '18px system-ui';
          ctx.fillText('✨', sx, sy);
        } else if (tile.content === 'chest') {
          ctx.font = '16px system-ui';
          ctx.fillText('🧰', sx, sy);
        } else if (tile.adjacent && tile.adjacent > 0) {
          ctx.font = 'bold 15px ui-monospace, monospace';
          ctx.fillStyle = HINT_COLORS[tile.adjacent] ?? '#fff';
          ctx.fillText(String(tile.adjacent), sx, sy);
        }
      }
    }

    // Rabbits, sorted back-to-front by depth so overlap reads correctly.
    for (const r of [...rabbits.values()].sort((a, b) => a.x + a.y - (b.x + b.y))) {
      const { sx, sy } = iso(r.x, r.y);
      ctx.font = '24px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = r.alive ? 1 : 0.35;
      ctx.fillText(r.crowned ? '👑' : '🐰', sx, sy - 10);
      ctx.globalAlpha = 1;

      ctx.font = r.playerId === meId ? 'bold 11px system-ui' : '11px system-ui';
      ctx.fillStyle = r.playerId === meId ? '#ffd45c' : '#cfd8e3';
      ctx.fillText(r.name, sx, sy - 30);
    }

    // The volcano's warning, drawn over everything: at stage 3 the island is
    // nearly spent and the player needs to feel it without reading a number.
    if (warnStage > 0) {
      ctx.fillStyle = `rgba(255, ${110 - warnStage * 30}, 40, ${0.05 * warnStage})`;
      ctx.fillRect(0, 0, w, h);
    }
  }, [island, rabbits, meId, warnStage]);

  return <canvas ref={ref} style={{ imageRendering: 'pixelated', display: 'block', margin: '0 auto' }} />;
}
