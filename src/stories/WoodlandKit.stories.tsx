import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { WoodlandButton, WoodlandCornerBadge, WoodlandParchmentToast, WoodlandTabs, WoodlandNotification, WoodlandHarvest, WoodlandIcon, WoodlandMeter, WoodlandNotice, WoodlandPanel, WoodlandSlot, WoodlandToggle, type WoodlandIconName } from '@/components/woodland';

const meta = {
  title: 'Design Kit/Woodland',
  component: WoodlandButton,
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'desktop', isRotated: false } },
} satisfies Meta<typeof WoodlandButton>;
export default meta;
type Story = StoryObj<typeof meta>;

function Showcase() {
  const [sound, setSound] = useState(true);
  const [hints, setHints] = useState(false);
  const [energy, setEnergy] = useState(72);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState('Sac');
  const [notice, setNotice] = useState('Ton terrier est sauvegardé.');
  const [claimed, setClaimed] = useState(false);
  const items: WoodlandIconName[] = ['carrot', 'bomb', 'water', 'shield', 'swords', 'garden'];
  return <main className="wl-kit">
    <header className="wl-kit-header"><div><h1>Les trésors du terrier</h1><p>Bois sculpté, feuilles sauvages et petits trésors.<br />Une collection d’interfaces pour Rabbit Royale.</p></div><img className="wl-kit-logo" src="/assets/ui/rr-logo-banner.webp" alt="Rabbit Royale" /></header>
    <div className="wl-kit-grid">
      <WoodlandPanel title="À l’aventure"><div className="wl-stack">
        <WoodlandButton tone="gold" icon="garden" onClick={() => setNotice('L’aventure commence !')}>Explorer</WoodlandButton>
        <WoodlandButton icon="shop" onClick={() => setNotice('Bienvenue à la boutique.')}>Boutique</WoodlandButton>
        <WoodlandButton tone="green" icon="carrot" onClick={() => setNotice('Récolte récupérée !')}>Récolter</WoodlandButton>
        <WoodlandButton tone="danger" icon="swords" onClick={() => setNotice('Prépare ton prochain raid.')}>Lancer un raid</WoodlandButton>
        <WoodlandButton disabled icon="shield">Bientôt</WoodlandButton>
        <small>Survole, clique ou utilise Tab pour essayer les états.</small>
      </div></WoodlandPanel>
      <WoodlandPanel title="Le sac à dos"><div className="wl-stack">
        <div className="wl-tabs" aria-label="Rubriques du sac">{['Sac', 'Quêtes'].map(name => <WoodlandButton key={name} tone={tab === name ? 'gold' : 'wood'} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</WoodlandButton>)}</div>
        {tab === 'Sac' ? <><div className="wl-inventory">{Array.from({ length: 9 }, (_, i) => <WoodlandSlot key={i} label={items[i] ? `${items[i]}, ${i === 0 ? 128 : i + 1}` : `Emplacement vide ${i + 1}`} icon={items[i]} count={items[i] ? i === 0 ? 128 : i + 1 : undefined} selected={selected === i} onClick={() => setSelected(i)} />)}</div><small>{items[selected] ? `Objet sélectionné : ${items[selected]}` : 'Un peu de place pour ta prochaine trouvaille.'}</small></> : <p>Explore l’île et rapporte 12 carottes à ton terrier.</p>}
      </div></WoodlandPanel>
      <WoodlandPanel title="Prêt à creuser"><div className="wl-stack">
        <div className="wl-row"><WoodlandIcon name="carrot" size={42} /><strong>{claimed ? '152' : '128'} carottes</strong></div>
        <WoodlandMeter label="Énergie" value={energy} tone={energy < 25 ? 'danger' : 'green'} />
        <label><small>Essayer la jauge</small><input aria-label="Énergie de démonstration" type="range" min="0" max="100" value={energy} onChange={e => setEnergy(Number(e.target.value))} /></label>
        <WoodlandMeter label="Prochaine récompense" value={3} max={5} tone="gold" />
        <WoodlandToggle label="Sons du terrier" checked={sound} onChange={setSound} />
        <WoodlandToggle label="Aide au creusage" checked={hints} onChange={setHints} />
      </div></WoodlandPanel>
      <WoodlandPanel title="Une belle récolte"><div className="wl-stack">
        <div className="wl-row"><WoodlandIcon name="carrot" size={58} /><div><strong>Le garde-manger se remplit</strong><br /><small>Récompense de quête · 24 carottes</small></div></div>
        <p>Chaque expédition rapporte un petit quelque chose à la maison.</p>
        <WoodlandButton tone="gold" disabled={claimed} onClick={() => { setClaimed(true); setNotice('24 carottes ajoutées à ton sac !'); }}>{claimed ? 'Récupéré !' : 'Récupérer les 24 carottes'}</WoodlandButton>
      </div></WoodlandPanel>
      <WoodlandPanel title="Des nouvelles"><div className="wl-stack">
        <WoodlandNotice>{notice}</WoodlandNotice>
        <WoodlandNotice tone="gold">Une nouvelle quête !</WoodlandNotice>
        <WoodlandNotice tone="danger">Il te manque 20 carottes.</WoodlandNotice>
      </div></WoodlandPanel>
      <WoodlandPanel title="Petits trésors"><div className="wl-stack"><div className="wl-row">{items.map(icon => <WoodlandIcon key={icon} name={icon} size={40} />)}</div><p>Des icônes du jeu, des textes vivants et des cadres qui s’adaptent au contenu.</p><small>Les coins feuillus gardent leur taille quand les panneaux s’agrandissent.</small></div></WoodlandPanel>
    </div>
    <footer className="wl-kit-footer">Atelier Woodland · Composants interactifs · Illustrations transparentes existantes du jeu</footer>
  </main>;
}

export const Collection: Story = { render: () => <Showcase /> };
export const Button: Story = {
  args: { children: 'Explorer', tone: 'gold', icon: 'garden', disabled: false },
  argTypes: { tone: { control: 'select', options: ['gold', 'wood', 'green', 'danger'] }, icon: { control: 'select', options: ['garden', 'carrot', 'bomb', 'bolt', 'shield', 'swords', 'water', 'shop'] } },
  decorators: [Story => <div className="wl-kit"><Story /></div>],
};
export const Narrow: Story = { render: () => <Showcase />, globals: { viewport: { value: 'seekerPortrait', isRotated: false } } };

function ShopAndRewardsDemo() {
  const [tab, setTab] = useState('seeds');
  const [verticalTab, setVerticalTab] = useState('seeds');
  const [harvested, setHarvested] = useState(false);
  const [message, setMessage] = useState('Partie sauvegardée !');
  const tabs = [
    { id: 'seeds', label: 'Graines', icon: 'garden' as const, content: <p>Prépare la prochaine récolte de ton terrier.</p> },
    { id: 'tools', label: 'Outils', icon: 'shield' as const, content: <p>Tout pour protéger ton potager.</p> },
    { id: 'boosts', label: 'Boosts', icon: 'bolt' as const, content: <p>Un petit coup de pouce pour repartir.</p> },
  ];
  return <main className="wl-kit">
    <header className="wl-kit-header"><div><h1>La vie du terrier</h1><p>La boutique, les récoltes et les bonnes nouvelles.</p></div></header>
    <div className="wl-kit-grid">
      <WoodlandPanel title="La boutique"><div className="wl-stack">
        <WoodlandTabs tabs={tabs} value={tab} onChange={setTab} />
        <WoodlandTabs label="Boutique verticale" tabs={tabs} value={verticalTab} onChange={setVerticalTab} orientation="vertical" />
      </div></WoodlandPanel>
      <WoodlandPanel title="Notifications"><div className="wl-stack">
        <WoodlandParchmentToast title="Nouvelle quête !" description="Retrouve les carottes perdues." onOpen={() => setMessage('Quête suivie : récolter 12 carottes.')} actionLabel="Suivre la quête" />
        <WoodlandParchmentToast variant="achievement" title="Succès débloqué !" description="Ta toute première récolte." />
        <WoodlandNotification title="Livraison arrivée" icon="shop" onOpen={() => setMessage('Livraison récupérée !')} actionLabel="Récupérer la livraison">Ton potager t’attend.</WoodlandNotification>
      </div></WoodlandPanel>
      <WoodlandPanel title="Récoltes"><div className="wl-stack">
        <WoodlandHarvest tone="gold" onClick={() => setMessage('Récolte dorée récupérée !')}>Récolte prête !</WoodlandHarvest>
        <WoodlandHarvest tone="green" disabled={harvested} onClick={() => { setHarvested(true); setMessage('+24 carottes dans ton sac !'); }}>{harvested ? 'Récolte récupérée' : 'Récolter 24 carottes'}</WoodlandHarvest>
        <WoodlandNotice tone="danger">Énergie faible !</WoodlandNotice>
        <WoodlandNotice tone="blue">Nouvel objet !</WoodlandNotice>
      </div></WoodlandPanel>
      <WoodlandPanel title="Petits messages"><div className="wl-stack">
        <WoodlandNotice tone="wood">+1 carotte</WoodlandNotice>
        <WoodlandNotice tone="green">{message}</WoodlandNotice>
        <WoodlandNotice tone="danger">Pas assez de carottes !</WoodlandNotice>
        <WoodlandNotice tone="gold">Quête mise à jour !</WoodlandNotice>
      </div></WoodlandPanel>
    </div>
  </main>;
}
export const ShopAndRewards: Story = { render: () => <ShopAndRewardsDemo /> };

function ParchmentDemo() {
  const [opened, setOpened] = useState(false);
  return <main className="wl-kit"><header className="wl-kit-header"><div><h1>Quêtes & succès</h1><p>Les petites nouvelles du terrier.</p></div></header><div className="wl-stack" style={{ maxWidth: 440, margin: 'auto', gap: 24 }}>
    <WoodlandParchmentToast title="Nouvelle quête !" description="Retrouve les carottes perdues." onOpen={() => setOpened(true)} actionLabel="Ouvrir la quête" />
    <WoodlandParchmentToast variant="achievement" title="Succès débloqué !" description="Première récolte" />
    {opened && <WoodlandPanel title="Carottes perdues"><p>Rapporte 12 carottes au terrier.</p><WoodlandButton onClick={() => setOpened(false)}>Fermer</WoodlandButton></WoodlandPanel>}
  </div></main>;
}
export const ParchmentNotifications: Story = { render: () => <ParchmentDemo /> };

export const BadgesAndBanners: Story = { render: () => <main className="wl-kit">
  <header className="wl-kit-header"><div><h1>Récoltes & pastilles</h1><p>Des petits repères au coin des boutons.</p></div></header>
  <div className="wl-kit-grid">
    <WoodlandPanel title="Pastilles"><div className="wl-stack">
      <div className="wl-row">{([1, 8, 24, 100, '!'] as const).map(value => <WoodlandCornerBadge key={value} value={value} />)}</div>
      <div className="wl-row">{([1, 8, 24, 100, '!'] as const).map(value => <WoodlandCornerBadge key={value} value={value} shape="square" />)}</div>
      <div className="wl-corner-anchor"><WoodlandButton icon="shop" aria-label="Boutique, 3 nouveautés">Boutique</WoodlandButton><WoodlandCornerBadge value={3} attached /></div>
      <div className="wl-corner-anchor"><WoodlandButton icon="garden" aria-label="Récolte disponible">Potager</WoodlandButton><WoodlandCornerBadge value="!" shape="square" attached /></div>
    </div></WoodlandPanel>
    <WoodlandPanel title="Bandeaux"><div className="wl-stack">
      <WoodlandNotice tone="gold">Récolte prête !</WoodlandNotice>
      <WoodlandHarvest tone="green">Récolter 24 carottes</WoodlandHarvest>
      <WoodlandNotice tone="danger">Énergie faible !</WoodlandNotice>
      <WoodlandNotice tone="blue">Nouvel objet !</WoodlandNotice>
    </div></WoodlandPanel>
  </div>
</main> };
