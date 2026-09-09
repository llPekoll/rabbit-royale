import { Assets, Container, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { GOLDEN_COIN_ALIASES } from '@domin8/arcade-kit/pixi';

/**
 * Looping golden-coin fall for the cash-out celebration. Spawns a burst at
 * `start()` and a new burst every 2 seconds until `stop()`. Intensity (coin
 * count + scale) scales with the palier reached.
 */
export class CoinRain {
  private liveCoins: Sprite[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private parent: Container) {}

  /** Start the looping rain at the intensity for `palierValue`. */
  start(palierValue: number): void {
    this.stop();
    this.burst(palierValue);
    this.interval = setInterval(() => this.burst(palierValue), 2000);
  }

  /** Kill the loop, clear all live coin tweens + sprites. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    for (const coin of this.liveCoins) {
      gsap.killTweensOf(coin);
      coin.parent?.removeChild(coin);
      coin.destroy();
    }
    this.liveCoins = [];
  }

  private burst(palierValue: number): void {
    const coinCount = palierValue >= 100 ? 80
      : palierValue >= 50 ? 60
      : palierValue >= 25 ? 45
      : palierValue >= 10 ? 30
      : palierValue >= 5 ? 20
      : 12;
    const coinScale = palierValue >= 25 ? 4 : palierValue >= 10 ? 3.5 : 3;
    const maxDelay = 1.8;

    for (let i = 0; i < coinCount; i++) {
      const x = 30 + Math.random() * 900;
      const frame = Math.floor(Math.random() * GOLDEN_COIN_ALIASES.length);
      const tex = Assets.get(GOLDEN_COIN_ALIASES[frame]);
      if (!tex) continue;
      const coin = new Sprite(tex);
      coin.anchor.set(0.5);
      coin.position.set(x, -80);
      coin.scale.set(coinScale);
      coin.alpha = 0;
      coin.zIndex = 59;
      this.parent.addChild(coin);
      this.liveCoins.push(coin);

      const delay = Math.random() * maxDelay;

      gsap.to(coin, {
        y: 620,
        x: x + (Math.random() - 0.5) * 120,
        rotation: (Math.random() - 0.5) * Math.PI * 4,
        duration: 1.0 + Math.random() * 1.4,
        delay,
        ease: 'quad.in',
        onComplete: () => {
          this.parent.removeChild(coin);
          coin.destroy();
          const idx = this.liveCoins.indexOf(coin);
          if (idx !== -1) this.liveCoins.splice(idx, 1);
        },
      });

      const alphaTl = gsap.timeline({ delay });
      alphaTl.to(coin, { alpha: 1, duration: 1, ease: 'none' });
      alphaTl.to(coin, { alpha: 0, duration: 0.5, ease: 'none' }, '+=0.5');
    }
  }
}
