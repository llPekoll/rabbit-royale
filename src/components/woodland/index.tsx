'use client';

import { useId, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { LeafFrame } from '../leaf-frame';
import './woodland.css';

export type WoodlandIconName = 'carrot' | 'bomb' | 'bolt' | 'garden' | 'shield' | 'swords' | 'water' | 'shop';
export function WoodlandIcon({ name, size = 28 }: { name: WoodlandIconName; size?: number }) {
  return <img className="wl-icon" src={`/assets/ui/icons/${name}.${name === 'bomb' || name === 'shop' ? 'png' : 'webp'}`} width={size} height={size} alt="" draggable={false} />;
}

export interface WoodlandButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'gold' | 'wood' | 'green' | 'danger';
  icon?: WoodlandIconName;
}
export function WoodlandButton({ tone = 'wood', icon, children, className = '', ...props }: WoodlandButtonProps) {
  return <button type="button" {...props} className={`wl-button wl-${tone} ${className}`}>
    <span className="wl-button-face">{icon && <WoodlandIcon name={icon} />}{children}</span>
  </button>;
}

export function WoodlandPanel({ title, children, className = '', style }: {
  title?: string; children: ReactNode; className?: string; style?: CSSProperties;
}) {
  return <LeafFrame corner={36} className={`wl-panel ${className}`} style={style}>
    {title && <h2 className="wl-panel-title">{title}</h2>}{children}
  </LeafFrame>;
}

export function WoodlandMeter({ label, value, max = 100, tone = 'green' }: {
  label: string; value: number; max?: number; tone?: 'green' | 'gold' | 'danger';
}) {
  const limit = Number.isFinite(max) && max > 0 ? max : 100;
  const current = Number.isFinite(value) ? Math.min(limit, Math.max(0, value)) : 0;
  return <div className={`wl-meter wl-${tone}`}>
    <div className="wl-meter-caption"><span>{label}</span><span>{current} / {limit}</span></div>
    <div className="wl-meter-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={current}>
      <span style={{ width: `${current / limit * 100}%` }} />
    </div>
  </div>;
}

export function WoodlandToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" className="wl-toggle" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
    <span>{label}</span><span className="wl-toggle-track"><span /></span>
  </button>;
}

export function WoodlandSlot({ icon, count, label, selected = false, ...props }: {
  icon?: WoodlandIconName; count?: number; label: string; selected?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`wl-slot ${selected ? 'wl-selected' : ''}`} aria-label={label} aria-pressed={selected}>
    {icon && <WoodlandIcon name={icon} size={38} />}{count !== undefined && <span>{count}</span>}
  </button>;
}

export function WoodlandNotice({ tone = 'green', children }: { tone?: 'green' | 'gold' | 'danger' | 'blue' | 'wood'; children: ReactNode }) {
  return <div className={`wl-notice wl-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
    <span className="wl-notice-symbol" aria-hidden="true">{tone === 'wood' ? <WoodlandIcon name="carrot" /> : tone === 'green' ? '✓' : tone === 'danger' ? '!' : tone === 'blue' ? '◆' : '★'}</span><span className="wl-notice-text">{children}</span>
  </div>;
}

export interface WoodlandTab { id: string; label: string; icon?: WoodlandIconName; content: ReactNode }
/** Controlled tabs with linked panels and roving keyboard focus. */
export function WoodlandTabs({ tabs, value, onChange, orientation = 'horizontal', label = 'Boutique' }: {
  tabs: WoodlandTab[]; value: string; onChange: (value: string) => void;
  orientation?: 'horizontal' | 'vertical'; label?: string;
}) {
  const id = useId();
  return <div className={`wl-tabset wl-tabset-${orientation}`}>
    <div className="wl-tablist" role="tablist" aria-label={label} aria-orientation={orientation}>
      {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`${id}-tab-${tab.id}`} aria-controls={`${id}-panel-${tab.id}`} aria-selected={value === tab.id} tabIndex={value === tab.id ? 0 : -1}
        onClick={() => onChange(tab.id)} onKeyDown={event => {
          const next = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
          const previous = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
          if (![next, previous, 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === next ? 1 : -1) + tabs.length) % tabs.length;
          onChange(tabs[target].id);
          document.getElementById(`${id}-tab-${tabs[target].id}`)?.focus();
        }}>{tab.icon && <WoodlandIcon name={tab.icon} size={24} />}{tab.label}</button>)}
    </div>
    {tabs.map(tab => <div key={tab.id} role="tabpanel" id={`${id}-panel-${tab.id}`} aria-labelledby={`${id}-tab-${tab.id}`} hidden={value !== tab.id} tabIndex={0}>{tab.content}</div>)}
  </div>;
}

export function WoodlandNotification({ title, children, icon = 'garden', onOpen, actionLabel = 'Voir' }: {
  title: string; children?: ReactNode; icon?: WoodlandIconName; onOpen?: () => void; actionLabel?: string;
}) {
  return <LeafFrame corner={30} className="wl-notification">
    <WoodlandIcon name={icon} size={36} />
    <div role="status"><strong>{title}</strong>{children && <p>{children}</p>}</div>
    {onOpen && <button type="button" aria-label={actionLabel} onClick={onOpen}>›</button>}
  </LeafFrame>;
}

export function WoodlandHarvest({ tone = 'green', children, ...props }: Omit<WoodlandButtonProps, 'tone' | 'icon'> & {
  tone?: 'green' | 'gold' | 'danger' | 'blue';
}) {
  return <button type="button" {...props} className={`wl-harvest wl-notice wl-${tone} ${props.className ?? ''}`}>
    <WoodlandIcon name="carrot" size={32} /><span className="wl-notice-text">{children}</span>
  </button>;
}
