/**
 * What a push SAYS, in the player's language.
 *
 * Localized here, on the server, because a notification is drawn by the OS
 * while the game is closed: there is no Godot running to look a key up in
 * `godot/assets/i18n/`. The lines borrow that file's words and tone on
 * purpose — "{0} is raiding your burrow!" is the game's own alert, "Bring it
 * in before a raider does" its own nudge — so the phone and the game sound
 * like the same rabbit.
 *
 * The five locales the game ships (en, fr, pt-BR, vi, zh). Anything else, or
 * nothing, reads as English: a push in the wrong language is still a push,
 * one with no text is not.
 */
export const PUSH_LOCALES = ['en', 'fr', 'pt-BR', 'vi', 'zh'] as const;
export type PushLocale = (typeof PUSH_LOCALES)[number];

/**
 * A device locale tag → one of ours.
 *
 * Tolerant of every spelling a client might send: BCP 47 (`pt-BR`,
 * `zh-Hans-CN`), POSIX/Godot (`pt_BR`, `fr_FR`), bare language (`vi`), any
 * case. Portuguese of any region reads the Brazilian text — the only one
 * written — and every Chinese reads `zh`, which is written in simplified
 * characters.
 */
export function resolveLocale(tag: unknown): PushLocale {
  if (typeof tag !== 'string') return 'en';
  const lang = tag.trim().toLowerCase().split(/[-_.@]/)[0];
  switch (lang) {
    case 'fr': return 'fr';
    case 'pt': return 'pt-BR';
    case 'vi': return 'vi';
    case 'zh': return 'zh';
    default: return 'en';
  }
}

/** Every kind of push, and the screen the client opens when it is tapped. */
export type PushKind =
  | 'raid_incoming'
  | 'raid_looted'
  | 'raid_held'
  | 'energy_full'
  | 'energy_overnight'
  | 'garden_ready'
  | 'comeback_1'
  | 'comeback_2'
  | 'snack_ready'
  | 'snack_pack';

/** Where the client routes a tap (`data.path`). */
export type PushPath = 'burrow' | 'defend' | 'island';

export const PUSH_PATH: Record<PushKind, PushPath> = {
  raid_incoming: 'defend',
  raid_looted: 'burrow',
  raid_held: 'burrow',
  energy_full: 'island',
  energy_overnight: 'island',
  garden_ready: 'burrow',
  comeback_1: 'burrow',
  comeback_2: 'burrow',
  snack_ready: 'burrow',
  snack_pack: 'burrow',
};

/** `{name}` is the raider, `{n}` the carrots taken (raids) or waiting
 *  (garden), or the day of the week's snack (1 … 7). */
export interface PushVars {
  name?: string;
  n?: number;
}

type Line = { title: string; body: string };

const TEXT: Record<PushLocale, Record<PushKind, Line>> = {
  en: {
    raid_incoming: { title: '{name} is raiding your burrow!', body: 'Right now. Come home and defend.' },
    raid_looted: { title: '{name} raided you: -{n} 🥕', body: 'Bury bombs on the path before the next one.' },
    raid_held: { title: 'Burrow held!', body: '{name} came for your carrots and left with nothing.' },
    energy_full: { title: 'Energy full', body: "A run's worth in the tank. Dig." },
    energy_overnight: { title: 'Your tank fills up tonight', body: 'Regen stops at full while you sleep. Spend some on a run first.' },
    garden_ready: { title: '{n} 🥕 waiting for you', body: 'Your garden is full. Bring them in before a raider does.' },
    comeback_1: { title: '{n} 🥕 in your garden', body: 'Raiders have noticed. Come pick them up.' },
    comeback_2: { title: 'Your burrow misses you', body: 'Full tank, full garden, and a crown still up for grabs.' },
    snack_ready: { title: 'Snack Time 🎁 day {n}', body: 'Your surprise box is ready — and opening it doubles your next run.' },
    snack_pack: { title: 'Day {n}: a GOLDEN box ✨', body: 'Better odds today, and a gift for your burrow.' },
  },
  fr: {
    raid_incoming: { title: '{name} pille ton terrier !', body: 'En ce moment. Rentre défendre.' },
    raid_looted: { title: '{name} t’a pillé : -{n} 🥕', body: 'Enterre des bombes sur le chemin avant le prochain.' },
    raid_held: { title: 'Terrier défendu !', body: '{name} est venu pour tes carottes et repart bredouille.' },
    energy_full: { title: 'Énergie pleine', body: 'De quoi sortir. Creuse.' },
    energy_overnight: { title: 'Ton énergie sera pleine cette nuit', body: 'Pleine, elle ne remonte plus pendant que tu dors. Fais une sortie avant.' },
    garden_ready: { title: '{n} 🥕 t’attendent', body: 'Ton potager est plein. Viens les ramasser avant un pillard.' },
    comeback_1: { title: '{n} 🥕 dans ton potager', body: 'Les pillards l’ont remarqué. Viens les chercher.' },
    comeback_2: { title: 'Ton terrier t’attend', body: 'Énergie pleine, potager plein, et la couronne est toujours à prendre.' },
    snack_ready: { title: 'Snack Time 🎁 jour {n}', body: 'Ta boîte surprise est prête — et l’ouvrir double ta prochaine partie.' },
    snack_pack: { title: 'Jour {n} : boîte DORÉE ✨', body: 'Meilleures chances aujourd’hui, et un cadeau pour ton terrier.' },
  },
  'pt-BR': {
    raid_incoming: { title: '{name} está saqueando sua toca!', body: 'Agora mesmo. Volte e defenda.' },
    raid_looted: { title: '{name} saqueou você: -{n} 🥕', body: 'Enterre bombas no caminho antes do próximo.' },
    raid_held: { title: 'Toca defendida!', body: '{name} veio atrás das suas cenouras e saiu sem nada.' },
    energy_full: { title: 'Energia cheia', body: 'Dá uma saída. Cave.' },
    energy_overnight: { title: 'Sua energia enche esta noite', body: 'Cheia, ela para de subir enquanto você dorme. Faça uma saída antes.' },
    garden_ready: { title: '{n} 🥕 esperando você', body: 'Sua horta está cheia. Colha antes que um saqueador colha.' },
    comeback_1: { title: '{n} 🥕 na sua horta', body: 'Os saqueadores perceberam. Venha buscar.' },
    comeback_2: { title: 'Sua toca sente sua falta', body: 'Energia cheia, horta cheia, e a coroa ainda está em jogo.' },
    snack_ready: { title: 'Snack Time 🎁 dia {n}', body: 'Sua caixa surpresa está pronta — e abri-la dobra sua próxima partida.' },
    snack_pack: { title: 'Dia {n}: caixa DOURADA ✨', body: 'Chances melhores hoje, e um presente para sua toca.' },
  },
  vi: {
    raid_incoming: { title: '{name} đang cướp hang bạn!', body: 'Ngay lúc này. Về phòng thủ đi.' },
    raid_looted: { title: '{name} đã cướp bạn: -{n} 🥕', body: 'Chôn bom trên đường trước khi kẻ tiếp theo tới.' },
    raid_held: { title: 'Hang đã giữ được!', body: '{name} đến cướp cà rốt và ra về tay trắng.' },
    energy_full: { title: 'Năng lượng đầy', body: 'Đủ một chuyến. Đào.' },
    energy_overnight: { title: 'Năng lượng sẽ đầy trong đêm nay', body: 'Đầy rồi thì không hồi thêm khi bạn ngủ. Đi một chuyến trước đã.' },
    garden_ready: { title: '{n} 🥕 đang chờ bạn', body: 'Vườn đầy rồi. Thu hoạch trước khi kẻ cướp tới.' },
    comeback_1: { title: '{n} 🥕 trong vườn của bạn', body: 'Kẻ cướp đã để ý. Về lấy đi.' },
    comeback_2: { title: 'Hang đang chờ bạn', body: 'Đầy năng lượng, đầy vườn, và vương miện vẫn còn đó.' },
    snack_ready: { title: 'Snack Time 🎁 ngày {n}', body: 'Hộp bất ngờ đã sẵn sàng — mở nó để nhân đôi lượt chơi tiếp theo.' },
    snack_pack: { title: 'Ngày {n}: hộp VÀNG ✨', body: 'Tỉ lệ tốt hơn hôm nay, và một món quà cho hang của bạn.' },
  },
  zh: {
    raid_incoming: { title: '{name} 正在掠夺你的兔窝！', body: '就是现在。快回去防守。' },
    raid_looted: { title: '{name} 掠夺了你：-{n} 🥕', body: '下一个来之前，在路上埋好炸弹。' },
    raid_held: { title: '兔窝守住了！', body: '{name} 想来偷胡萝卜，结果空手而归。' },
    energy_full: { title: '体力已满', body: '够出行一次。去挖。' },
    energy_overnight: { title: '今晚体力就会满', body: '满了就不再恢复，睡觉时白白浪费。睡前先出去挖一趟。' },
    garden_ready: { title: '{n} 🥕 在等你', body: '菜园满了。趁掠夺者动手前收进来。' },
    comeback_1: { title: '菜园里有 {n} 🥕', body: '掠夺者已经盯上了。快回来收。' },
    comeback_2: { title: '你的兔窝在等你', body: '体力满了，菜园满了，王冠还没人拿走。' },
    snack_ready: { title: 'Snack Time 🎁 第 {n} 天', body: '惊喜盒子准备好了——打开它，下一局胡萝卜翻倍。' },
    snack_pack: { title: '第 {n} 天：金色盒子 ✨', body: '今天几率更高，还有送给你洞穴的礼物。' },
  },
};

/**
 * A raider's name as it goes into a notification: trimmed and capped, so a
 * long name cannot push the rest of the title off a lock screen.
 */
function shortName(name: string | undefined): string {
  const n = (name ?? '').trim() || '?';
  return n.length > 24 ? `${n.slice(0, 23)}…` : n;
}

function fill(s: string, vars: PushVars): string {
  return s
    .replace('{name}', shortName(vars.name))
    .replace('{n}', String(Math.max(0, Math.round(vars.n ?? 0))));
}

/** Title and body of `kind` for a device set to `locale`. */
export function pushText(kind: PushKind, locale: unknown, vars: PushVars = {}): Line {
  const line = TEXT[resolveLocale(locale)][kind];
  return { title: fill(line.title, vars), body: fill(line.body, vars) };
}
