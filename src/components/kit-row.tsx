'use client';

import { useId, useState } from 'react';
import { ITEM_META } from './item-meta';
import type { ItemKind } from './use-shop';
import { useT } from '@/i18n/provider';
import { groupDigits, shortWait } from '@/i18n/format';
import { PxButton, PxPanel } from './px';
import './kit-row.css';

export interface BoostState {
  held: number;
  activeMs: number | null;
}

export type KitTool = Exclude<ItemKind, 'energy'> | 'water' | 'fertiliser';

export interface KitRowProps {
  held: Partial<Record<ItemKind, number>>;
  shieldMs: number | null;
  smokeDays: number;
  trapsPlaced?: number;
  trapsMaxPlaced?: number;
  onShield?(): void;
  onBuyTrap?(): void;
  trapCost?: number;
  trapsMaxHeld?: number;
  stock?: number;
  fencesPlaced?: number;
  fenceSpans?: number;
  fenceOffers?: number;
  onPlaceFence?(): void;
  onPlaceTrap?(): void;
  /** Inspecting an unrelated tool suspends board placement. */
  onInspect?(): void;
  water?: BoostState;
  fertiliser?: BoostState;
  onPour?(kind: 'water' | 'fertiliser'): void;
  pending?: boolean;
}

const GROUPS = [
  { label: 'groupDefence', kinds: ['shield', 'smoke', 'trap', 'fence'] },
  { label: 'groupAttack', kinds: ['bomb', 'lightning', 'mirage'] },
  { label: 'groupGarden', kinds: ['water', 'fertiliser'] },
] as const;

/** Inspecting an item never consumes or buys it. Names stay on the tools;
 * quantities, effects and explicit spending actions live in the detail card. */
export function KitRow(props: KitRowProps) {
  const t = useT();
  const id = useId();
  const [group, setGroup] = useState(0);
  const [selected, setSelected] = useState<KitTool>('trap');
  const [expanded, setExpanded] = useState(true);
  const { held, shieldMs, smokeDays, pending } = props;
  const copy = t.kit.tools;
  const name = (kind: KitTool) => kind === 'water' ? t.kit.watering
    : kind === 'fertiliser' ? t.kit.fertiliser : t.items[kind].name;
  const count = (kind: KitTool) => kind === 'water' || kind === 'fertiliser'
    ? props[kind]?.held ?? 0 : held[kind] ?? 0;
  const active = (kind: KitTool) => kind === 'shield' ? shieldMs
    : kind === 'water' || kind === 'fertiliser' ? props[kind]?.activeMs ?? null : null;
  const wait = (ms: number) => shortWait(ms, t.units);

  const select = (kind: KitTool) => {
    setSelected(kind);
    setExpanded(true);
    if (kind === 'trap') props.onPlaceTrap?.();
    else if (kind === 'fence') props.onPlaceFence?.();
    else props.onInspect?.();
  };

  const blurb = selected === 'water' ? copy.waterEffect
    : selected === 'fertiliser' ? copy.fertiliserEffect : t.items[selected].blurb;
  const remaining = active(selected);
  const amount = count(selected);
  let status = copy.available(amount);
  let hint = '';
  let action: { label: string; run: () => void; disabled?: boolean } | undefined;

  switch (selected) {
    case 'trap': {
      status = copy.available(amount) + ' \u00b7 ' + copy.placed(props.trapsPlaced ?? 0);
      hint = amount > 0 ? copy.trapHint : copy.trapEmpty;
      const full = props.trapsMaxHeld !== undefined && amount >= props.trapsMaxHeld;
      const broke = props.stock !== undefined && props.trapCost !== undefined && props.stock < props.trapCost;
      if (props.onBuyTrap && props.trapCost !== undefined) {
        action = { label: copy.buyTrap(groupDigits(props.trapCost)), run: props.onBuyTrap, disabled: full || broke };
        if (full) hint = t.kit.trapsBuyFull(amount);
        else if (broke) hint = copy.notEnough;
      }
      break;
    }
    case 'fence':
      status = copy.available(amount) + ' \u00b7 ' + copy.placed(props.fencesPlaced ?? 0);
      hint = copy.fenceHint;
      if (amount === 0 && !props.fencesPlaced) hint = copy.shopHint;
      else if (props.fenceOffers === 0 && (props.fencesPlaced ?? 0) > 0) hint = t.kit.fenceAllWalled(props.fencesPlaced!);
      break;
    case 'shield':
      hint = remaining !== null ? copy.shieldActive : amount === 0 ? copy.shopHint : '';
      if (props.onShield) action = { label: copy.raiseShield, run: props.onShield, disabled: amount === 0 || remaining !== null };
      break;
    case 'smoke':
      status = smokeDays > 0 ? copy.active(smokeDays + t.units.d) : t.shop.heldOff;
      hint = copy.smokeHint;
      break;
    case 'water':
    case 'fertiliser': {
      const kind = selected;
      if (!amount) hint = copy.chestHint;
      if (props.onPour) action = { label: kind === 'water' ? copy.water : copy.fertilise, run: () => props.onPour?.(kind), disabled: amount === 0 };
      break;
    }
    default:
      hint = copy.attackHint;
  }
  if (remaining !== null) status += ' \u00b7 ' + copy.active(wait(remaining));

  return (
    <section className="rr-kit-row rr-toolkit" aria-label={t.kit.aria}>
      {expanded && <PxPanel color="#48301f" className="rr-toolkit-detail" id={id + '-detail'}>
        <div className="rr-toolkit-summary">
          <ToolArt kind={selected} />
          <div><strong>{name(selected)}</strong><span className="rr-toolkit-stock">{status}</span></div>
          <button type="button" className="rr-toolkit-disclosure" aria-label={t.chrome.close}
            onClick={() => setExpanded(false)}>&times;</button>
        </div>
        <div className="rr-toolkit-explanation">
          <p>{blurb}</p>
          {hint && <p className="rr-toolkit-hint">{hint}</p>}
          {action && <PxButton className="rr-toolkit-action" color="#6b8035" disabled={pending || action.disabled}
            onClick={action.run}>{action.label}</PxButton>}
        </div>
      </PxPanel>}
      <div className="rr-toolkit-tabs" role="tablist" aria-label={t.kit.aria}>
        {GROUPS.map((entry, index) => (
          <button type="button" role="tab" key={entry.label} id={id + '-tab-' + index}
            aria-selected={group === index} aria-controls={id + '-tools'} tabIndex={group === index ? 0 : -1}
            onKeyDown={(event) => {
              const next = event.key === 'ArrowRight' ? (group + 1) % GROUPS.length
                : event.key === 'ArrowLeft' ? (group + GROUPS.length - 1) % GROUPS.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? GROUPS.length - 1 : null;
              if (next === null) return;
              event.preventDefault(); setGroup(next); select(next === 0 ? 'trap' : GROUPS[next].kinds[0]);
              document.getElementById(id + '-tab-' + next)?.focus();
            }}
            onClick={() => { setGroup(index); select(index === 0 ? 'trap' : entry.kinds[0]); }}>
            {t.kit[entry.label]}
          </button>
        ))}
      </div>
      <div className="rr-toolkit-tray" role="tabpanel" id={id + '-tools'}
        aria-labelledby={id + '-tab-' + group}>
        {GROUPS[group].kinds.map((kind) => (
          <button type="button" className="rr-toolkit-tool" key={kind} aria-pressed={selected === kind}
            aria-label={name(kind)} title={name(kind)}
            onClick={() => select(kind)}>
            <ToolArt kind={kind} />
            <span className="rr-toolkit-quantity" aria-hidden="true">{kind === 'smoke' ? smokeDays + t.units.d : count(kind)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ToolArt({ kind }: { kind: KitTool }) {
  const art = kind === 'water' || kind === 'fertiliser' ? '/assets/ui/icons/' + kind + '.webp'
    : kind === 'trap' ? '/assets/ui/icons/bomb.png'
      : kind === 'smoke' ? '/assets/clouds/Clouds_01.webp' : ITEM_META[kind].art;
  if (art) return <img className="rr-toolkit-art" src={art} alt="" draggable={false} />;
  // A crisp pixel spiral for mirage, without platform-dependent emoji glyphs.
  return <svg className="rr-toolkit-art" viewBox="0 0 24 24" aria-hidden="true" shapeRendering="crispEdges">
    <path d="M19 4H5V7H2V18H5V21H19V18H22V7H19V4ZM6 8H18V17H6V8Z" fill="#69468f" />
    <path d="M18 5H6V8H3V17H6V20H18V17H21V8H18V5ZM6 8H18V17H6V8Z" fill="#c5a1eb" />
    <path d="M8 10H16V15H10V13H13V12H8Z" fill="#f3dcff" />
  </svg>;
}
