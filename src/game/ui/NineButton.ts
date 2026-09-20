import { Assets, Container, NineSliceSprite, Rectangle, Texture } from 'pixi.js';
import gsap from 'gsap';
import { pixelText, setPixelText } from './PixelText';
import type { Label } from './textFace';

/**
 * Canvas counterpart of the approved Woodland buttons.
 *
 * NOTHING CONSTRUCTS THIS TODAY. The chrome it used to draw now lives in the
 * DOM (components/woodland/runtime.tsx), which is why only
 * `loadWoodlandButtonAssets` below is still imported — AssetLoader warms the
 * plank and notice textures with the rest of the art. The class is kept for
 * the controls that must be drawn ON the stage (a button that has to sort
 * against the island by isoDepth cannot be a div), and it is already on the
 * Woodland sprites, so it will not drag the old arcade chrome back in.
 */
export type ButtonTone = 'gold' | 'green' | 'slate' | 'carrot' | 'amber';
export interface NineButtonOptions {
  tone: ButtonTone;
  onTap?: () => void;
  sink?: boolean;
  pixelSize?: number;
}
const ART: Record<ButtonTone, string> = {
  gold: '/assets/ui/notice-gold.webp', green: '/assets/ui/notice-green.webp',
  slate: '/assets/ui/plank.webp', carrot: '/assets/ui/notice-gold.webp', amber: '/assets/ui/plank.webp',
};
export function measureButtonLabel(text: string, scale = 1): number {
  return text.toUpperCase().length * 8 * scale;
}
export function loadWoodlandButtonAssets(): Promise<unknown> {
  return Assets.load([...new Set(Object.values(ART))]);
}

export class NineButton {
  readonly container = new Container();
  private sprite = new NineSliceSprite({ texture: Texture.WHITE, leftWidth: 0, rightWidth: 0, topHeight: 0, bottomHeight: 0 });
  private label: Label;
  private keyBadge: Label | null = null;
  private tone: ButtonTone;
  private enabled = true;
  private pressed = false;
  private labelNudgeY = 0;
  private blink: gsap.core.Timeline | null = null;
  private _w = 0;
  private _h = 0;
  private request = 0;

  constructor(opts: NineButtonOptions) {
    this.tone = opts.tone;
    this.label = pixelText(0, 0, '');
    this.label.anchor.set(.5);
    this.sprite.visible = false;
    this.container.addChild(this.sprite, this.label);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.on('pointertap', () => { if (this.enabled) opts.onTap?.(); });
    this.container.on('pointerdown', () => this.press(true));
    for (const event of ['pointerup', 'pointerupoutside', 'pointerout'] as const) this.container.on(event, () => this.press(false));
    this.container.on('destroyed', () => this.destroyBlink());
    void this.updateArt();
  }
  get width() { return this._w; }
  get height() { return this._h; }
  get bevelPx() { return 0; }
  get isEnabled() { return this.enabled; }

  private async updateArt() {
    const request = ++this.request;
    const texture = await Assets.load<Texture>(ART[this.tone]);
    if (this.container.destroyed || request !== this.request) return;
    this.sprite.texture = texture;
    this.sprite.leftWidth = this.sprite.rightWidth = texture.width < 200 ? 30 : 340;
    this.sprite.visible = true;
    this.label.tint = this.tone === 'gold' || this.tone === 'carrot' ? 0x352011 : 0xfff0cb;
    this.layout();
  }
  private layout() {
    if (this.sprite.visible) {
      const scale = Math.max(.01, this._h / this.sprite.texture.height);
      this.sprite.scale.set(scale);
      this.sprite.width = this._w / scale;
      this.sprite.height = this._h / scale;
      this.sprite.position.set(-this._w / 2, -this._h / 2 + (this.pressed ? 2 : 0));
    }
    this.label.position.set(0, this.labelNudgeY + (this.pressed ? 2 : 0));
    this.keyBadge?.position.set(this._w / 2 - 12, this.pressed ? 2 : 0);
  }
  private press(pressed: boolean) {
    this.pressed = pressed && this.enabled;
    this.sprite.tint = this.pressed ? 0xdddddd : 0xffffff;
    this.layout();
  }
  setSize(w: number, h: number) {
    this._w = w; this._h = h;
    this.container.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    this.layout();
  }
  setTone(tone: ButtonTone) { if (tone !== this.tone) { this.tone = tone; void this.updateArt(); } }
  setLabel(text: string) { setPixelText(this.label, text.toUpperCase()); this.layout(); }
  setLabelScale(scale: number) { this.label.scale.set(scale); this.layout(); }
  setLabelNudgeY(px: number) { this.labelNudgeY = px; this.layout(); }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.container.eventMode = enabled ? 'static' : 'none';
    this.container.alpha = enabled ? 1 : .45;
    if (!enabled) this.press(false);
  }
  setVisible(visible: boolean) { this.container.visible = visible; }
  setKeyBadge(text: string | null) {
    if (text === null) { this.keyBadge?.destroy(); this.keyBadge = null; return; }
    if (!this.keyBadge) {
      this.keyBadge = pixelText(0, 0, text);
      this.keyBadge.anchor.set(1, .5); this.keyBadge.alpha = .65; this.keyBadge.scale.set(.75);
      this.container.addChild(this.keyBadge);
    } else setPixelText(this.keyBadge, text);
    this.layout();
  }
  setBlinking(on: boolean) {
    this.destroyBlink();
    if (on) this.blink = gsap.timeline({ repeat: -1 }).to(this.sprite, { alpha: .65, duration: .45 }).to(this.sprite, { alpha: 1, duration: .45 });
  }
  destroyBlink() { this.blink?.kill(); this.blink = null; this.sprite.alpha = 1; }
}
