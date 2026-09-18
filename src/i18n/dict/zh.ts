/**
 * 简体中文 — Simplified Chinese.
 *
 * NO CAPITALS, NO PLURALS, AND THAT IS NOT A SHORTCUT. Chinese has no letter
 * case, so the arcade's shouting simply does not exist here; and it marks no
 * plural, so `Intl.PluralRules` reports one form for every count and the
 * singular/plural functions return the same string either way. Both are
 * properties of the language, not omissions.
 *
 * SHORTER THAN THE ENGLISH, everywhere. A sinogram carries roughly a word, so
 * these lines run about half the length of their originals — which is a gift
 * to the fixed-height cards and the tagline ribbon, the two places the English
 * was already at its limit.
 *
 * THE VOICE. The island states facts and does not sell. Chinese has its own
 * way of doing that: no exclamation where English has none, 的 kept out of the
 * short labels, and the second person 你 used where the English says "you"
 * rather than being dropped for a more formal register the game does not have.
 */
import type { Dict } from '../dictionaries';

export const zh: Dict = {
  /* The unit characters. 分 is minutes, 小时 is hours — but a HUD has no room
     for two glyphs where one will do, so the short forms are used: 分, 时, 天. */
  units: { s: '秒', m: '分', h: '时', d: '天' },

  meta: {
    title: '兔子皇战：诅咒之冠',
    description: '竞技扫雷。挖掘，囤积，掠夺，戴上王冠。',
  },
  lang: { label: '语言' },

  auth: {
    connect: '连接钱包',
    connecting: '正在挖入...',
    guest: '以访客身份游玩',
    waiting: '等待中...',
    guestNote: '访客兔窝。连接钱包以保留它。',
    guestTag: '访客',
    noWallet: '未找到钱包。请在兔子皇战应用内打开，或安装 Solana 钱包。',
    signInFailed: '登录失败',
    guestFailed: '无法创建访客兔窝',
    walletTaken: '该钱包已有兔窝。',
    walletDigsFor: (name) => `该钱包已经在为「${name}」挖了。`,
    alreadyLinked: '该兔窝已绑定钱包。',
    linkFailed: '无法连接该钱包',
  },

  chrome: {
    loading: '加载中',
    waking: '唤醒兔群',
    moreBelow: '向下滚动查看更多',
    reconnecting: '重新连接...',
    back: '返回',
    close: '关闭',
    shop: '商店',
    story: '故事',
    season: '赛季',
    logoAlt: '兔子皇战',
    rotateTitle: '请横放手机',
    rotateBody: '兔子皇战以横屏游玩。',
  },

  install: {
    title: {
      ios: '添加到主屏幕',
      macSafari: '添加到程序坞',
      chromiumDesktop: '安装应用',
      androidChromium: '添加到主屏幕',
    },
    line: {
      ios: '全屏游玩，没有浏览器栏，从主屏幕一点即开。',
      macSafari: 'Rabbit Royale 在独立窗口中运行，从程序坞直接打开。',
      chromiumDesktop: 'Rabbit Royale 在独立窗口中运行，从程序坞一点即开。',
      androidChromium: '全屏游玩，没有浏览器栏，从主屏幕一点即开。',
    },
    steps: {
      ios: [
        '点击"分享"按钮（Safari 在底部工具栏，Chrome 在地址栏）。',
        '向下滚动，点击"添加到主屏幕"。',
        '点击"添加"。Rabbit Royale 会从主屏幕全屏打开。',
      ],
      macSafari: [
        '在菜单栏中选择 文件 > 添加到程序坞（或 分享 > 添加到程序坞）。',
        '点击"添加"。Rabbit Royale 会从程序坞在独立窗口中打开。',
        '需要 Safari 17 或更高版本。',
      ],
      prompt: ['点击下方的"安装"，然后在浏览器弹窗中确认。'],
      chromiumDesktop: [
        '点击地址栏右端的安装图标，或打开浏览器菜单 > 投放、保存和分享 > 将网页作为应用安装。',
        '点击"安装"确认。',
        '已经安装？那个图标会显示"在应用中打开"。',
      ],
      androidChromium: [
        '打开浏览器菜单（三个点），点击"添加到主屏幕"。',
        '点击"安装"。Rabbit Royale 会从主屏幕全屏打开。',
      ],
    },
    install: '安装',
    installing: '安装中...',
    showMe: '查看步骤',
    gotIt: '知道了',
    close: '关闭',
    app: '应用',
  },

  sound: {
    group: '声音',
    music: '音乐',
    effects: '音效',
    volume: '音量',
    on: '开',
    off: '关',
    settings: '声音设置',
    mute: '静音',
    unmute: '取消静音',
    musicOn: '音乐开启',
    musicOff: '音乐关闭',
  },

  loop: {
    dig: '挖掘',
    defend: '防守',
    raid: '掠夺',
    broughtHome: '已带回',
    ariaGroup: '挖掘、兔窝、掠夺',
    ariaDig: (line) => `挖掘。${line}`,
    ariaDefend: (line) => `防守：埋设陷阱。${line}`,
    ariaRaid: (line) => `掠夺。${line}`,
    energyOf: (energy, max) => `体力 ${energy}/${max}`,
    runCosts: (n) => `一次出行消耗 ${n}`,
    runIn: (wait) => `${wait}后可出行`,
    aMoment: '片刻',
    gardenPlus: (n) => `菜园 +${n}`,
    gardenEmpty: '菜园空了',
    shieldFor: (wait) => `护盾 ${wait}`,
    shieldBadge: (wait) => `护盾 ${wait}`,
    noShield: '无护盾',
    /* 中文不区分单复数。 */
    traps: (n) => `${n} 个陷阱`,
    leftOutside: (name, n) => `${name}在外面留下了 ${n}`,
    burrowsOpen: (n) => `${n} 个兔窝敞着`,
    bombsInBag: (n) => `包里有 ${n} 枚炸弹`,
    allShielded: '所有兔窝都有护盾',
  },

  next: {
    label: '下一步',
    aria: (text) => `下一步：${text}`,
    gardenFull: '菜园快满了。趁掠夺者动手前收进来。',
    shieldLifts: (wait) => `护盾将在${wait}后消失。埋下陷阱。`,
    raidTarget: (name, garden) => `${name}的菜园里留了 ${garden}。去掠夺。`,
    dig: (energy) => `${energy} 点体力：够出行一次。去挖。`,
    digPlain: '去挖。',
    runIn: (wait) => `${wait}后可出行。菜园会照样生长。`,
  },

  burrow: {
    title: '你的兔窝',
    level: (n) => `兔窝 - ${n} 级`,
    maxLevel: '已达最深',
    upgrade: '继续挖深',
    safe: '安全',
    exposed: (n) => `${n} 暴露在外`,
    garden: '菜园',
    harvest: '收获',
    energy: '体力',
    gardenGrows: '菜园长得更快了',
  },

  notes: {
    shieldUp: '护盾已起。掠夺会被弹开。',
    watered: '已浇水。菜园长得更快。',
    fed: '已施肥。菜园装得更多。',
    gardenEmpty: '菜园空了。晚点再来。',
    maxDepth: '你的兔窝已经挖到底了。',
    shieldAlready: '护盾已经起着了。',
    noneLeft: '没有了。宝箱里会掉。',
    toppedUp: '已经满了。留着以后用。',
    islandSilent: '岛屿没有回应。稍后再试。',
    runResumed: '回到你的这局。',
    reconnecting: '重新连接中...稍后再试。',
    harvested: (n) => `+${n} 🥕`,
    needMore: (n) => `还差 ${n} 🥕`,
    questDone: (title) => `任务完成：${title}`,
  },

  run: {
    goFarm: '清除所有地雷',
    findMe: '找到我的兔子',
    retreat: '撤退',
    home: '兔窝',
    stopWatching: '停止观战',
    theirRun: '他们的出行',
    chests: (taken: number, total: number) => `宝箱 ${taken}/${total}`,
    chestsTitle: '岛上所有人已取得的宝箱数。全部取完，岛就会沉没。',
    watching: (label) => `👁 正在观看 ${label}`,
    hearts: (full, total) => `${total} 颗心中剩 ${full} 颗`,
    heartsShort: (full, total) => `${full} / ${total} 心`,
    /** The run's energy bar, read aloud. */
    energy: (n, max) => `能量 ${n} / ${max}`,
    /** The red X — see FLAG in tuning. */
    markBomb: '标记炸弹',
    markHint: '点一块你认为有炸弹的格子 · 对：+能量 · 错：-能量',
    markCancel: '取消',
    markNothing: '这里没有可标记的：你周围的格子都已读过。',
    energyLow: '能量不足。标对一个炸弹会还你一些。',
    trapHint: (left) => `点格子埋雷，点雷收回 · 还剩 ${left}`,
    trapHintEmpty: '没有雷了 · 再买一颗，或点一颗雷收回改埋别处',
    strike: '雷击',
    aiming: '点一个对手施放雷击',
    strikeNone: '没有闪电可召。小屋有售。',
    plant: '埋雷',
    aimingPlant: '点一块未挖的地埋雷',
    plantNone: '没有雷可埋。小屋有售。',
    planted: '雷已埋下。只有你知道在哪。',
    plantRefused: {
      'off-island': '不在岛上。',
      revealed: '那块地已经挖过了。',
      hinted: '棋盘已经标明那块地是安全的。',
      chest: '不能埋在宝箱下。',
      'too-many': '这里最多只能有三颗雷。',
    } as Record<string, string>,
    plantedBy: (name) => `${name} 埋的雷！`,
    struckBy: (name) => `${name} 用闪电击中了你`,
  },

  firstRun: {
    tap: '点你旁边的格子来挖开。',
    numbers: '数字表示紧挨这格的炸弹数。',
    mark: '确定炸弹在哪？按红色 X 标记它：能量会回来。',
    marked: '对了！标对的 X 会还你能量。这样才能挖得更远。',
    bomb: '这耗了能量。那个 1 指的就是它。',
    golden: '金色！一根金胡萝卜顶五根。',
    chest: '一个宝箱。里面的东西会跟你回家。',
    clock: '岛屿就是计时器。挖光它，它就沉。',
    recap: '你的胡萝卜已经到家了。去看看。',
  },

  recap: {
    cleared: '全岛清空！',
    over: '出行结束',
    clearedNote: '值得挖的都挖了。剩下的被火山带走了。',
    overNote: '能量用完了。',
    tutorialDone: '到手了！',
    tutorialDoneNote: '宝箱就是这座岛的全部。你的胡萝卜在兔窝等着。',
    stats: (carrots, dug, bombs, time) => `🥕 ${carrots} · 挖了 ${dug} · 💣 ${bombs} · ${time}`,
    bank: (energy, max, cost) => `⚡ 兔窝里 ${energy}/${max} · 一次出行需要 ${cost}`,
    getEnergy: '补充体力',
    goHome: '回兔窝 · 囤起来',
  },

  pill: {
    banked: (n) => `已存入 ${n} 根胡萝卜`,
    carryNote: '本次带着的：走回家时才存入',
    carrying: (n) => `带着 ${n} 根胡萝卜，尚未存入`,
    leading: '领先',
    rankFirst: '赛季排名第 1：领跑榜单',
    rank: (rank, gap) => `赛季排名第 ${rank}：再得 ${gap} 分可超越第 ${rank - 1}`,
    toPass: (gap, rank) => `差 ${gap} 到第 ${rank - 1}`,
    showClimb: (n, rank) => `已存入 ${n} 根胡萝卜，赛季排名第 ${rank}。显示升名次所需`,
    hideClimb: (n, rank) => `已存入 ${n} 根胡萝卜，赛季排名第 ${rank}。隐藏升名次所需`,
  },

  board: {
    show: '显示赛季榜',
    hide: '隐藏赛季榜',
    diggingNow: '正在挖 · 点击观战',
    watch: (name) => `观看 ${name} 挖掘`,
    notOut: (name) => `${name}现在不在外面`,
  },

  shop: {
    title: '商店',
    shed: '工具棚',
    aria: '商店',
    protect: '保护基地',
    protectAria: '保护你的基地',
    protectBuyAria: '保护你的基地 - 买一个陷阱',
    noTraps: '没有陷阱 - 去买一个',
    nothingBuried: '什么都没埋',
    inShed: (n) => `棚里有 ${n} 个`,
    rearming: (n) => `重新布设 - ${n} 个即将归位`,
    upAndRearming: (armed, rearming) => `${armed} 个就位 - ${rearming} 个重设中`,
    inGround: (armed, max) => `地下 ${armed}/${max}`,
    openShed: '打开工具棚',
    payWith: '支付方式',
    outOfEnergy: '体力耗尽',
    energySay: (cost, wait) => `一次出行消耗 ${cost}。${wait}后会自己回满这么多。也可以现在补满，接着挖。`,
    energySayEmpty: (wait) => `体力条空了。${wait}后会自己回一点。也可以现在补满，接着挖。`,
    fillsTo: (max) => `把体力条补到 ${max}。`,
    noRefills: ' 今天不能再补了。',
    refillsLeft: (n) => ` 今天还能补 ${n} 次。`,
    cardsOff: '刷卡支付尚未开放。目前只收胡萝卜。',
    connectForCard: '连接钱包即可刷卡。这里的东西照样能挖出来。',
    eitherWay: '挖来的胡萝卜，或者刷卡。货都一样。',
    pricing: '计价中...',
    approve: '请在钱包中确认...',
    confirming: '链上确认中...',
    priceLabel: (price) => `${price} 根胡萝卜`,
    buy: (name, price) => `以 ${price} 购买${name}`,
    capped: (name, price) => `${name}：${price}。你已经拿到上限了。`,
    tooPoor: (name, price) => `${name}：${price}。胡萝卜还不够。去挖。`,
    heldOf: (held, cap) => `${held}/${cap}`,
    heldToday: (n) => `今天还剩 ${n}`,
    heldDaysLeft: (n) => `还剩 ${n} 天`,
    heldOff: '未启用',
    boughtEnergy: (paid) => `体力已补满。${paid}`,
    boughtTrap: (n, paid) => `${n} 个陷阱进了棚子。${paid}`,
    boughtBomb: (n, paid) => `${n} 枚炸弹已装好。${paid}`,
    boughtLightning: (n, paid) => `${n} 道闪电已装瓶。${paid}`,
    boughtShield: (n, paid) => `${n} 面护盾就绪。${paid}`,
    boughtSmoke: (paid) => `数字已经藏起来了。${paid}`,
    boughtMirage: (n, paid) => `${n} 个幻影可以丢出去了。${paid}`,
    paid: (spent) => `-${spent} 🥕`,
  },

  shopErrors: {
    fallback: '没成功。',
    insufficient_carrots: '胡萝卜不够。',
    inventory_full: '你的包里装满了。',
    daily_energy_limit: '今天不能再补了。菜园照样在长。',
    smoke_capped: '你的兔窝已经藏到最久了。',
    too_many_at_once: '一次太多了。',
    bad_quantity: '这不是一个数量。',
    no_traps: '没有陷阱了。去买一个，或等明天。',
    board_full: '你的兔窝再放不下一个陷阱了。',
    tile_not_trappable: '那里没东西可埋。',
    tile_doorstep: '离入口太近。门口的头几步不能埋。',
    tile_already_trapped: '已经埋过了。',
    no_trap_there: '那里没有陷阱。',
    payments_unavailable: '刷卡支付尚未开通。',
    quote_expired: '报价已过期。请重试。',
    signature_already_used: '该笔支付已被使用。',
    not_confirmed_yet: '仍在链上确认...',
    wrong_reference: '该交易与本次购买不符。',
    no_matching_transfer: '未找到匹配的 USDC 转账。',
    failed_on_chain: '交易在链上失败。',
  },

  pay: {
    needsBuild: '在应用内支付需要下一个版本。目前请用胡萝卜购买。',
    noWallet: '未找到 Solana 钱包。安装 Phantom 即可用 USDC 支付。',
    notConfigured: '此服务器未配置支付。',
    stillConfirming: '已付款，仍在确认。一分钟后重开商店。什么都不会丢。',
    failed: '支付失败',
  },

  kit: {
    aria: '你身上带着的东西',
    shieldHolding: (wait, held) => `护盾：生效中，还剩${wait}。包里有 ${held} 个。`,
    shieldReady: (held) => `护盾：包里有 ${held} 个。起一个。生效期间掠夺会被弹开。`,
    shieldNone: '护盾：没有。去商店买一个。',
    smokeOff: '烟幕：未启用。去商店买一个来遮住你的数字。',
    smokeUp: (days) => `烟幕：生效中，还剩 ${days} 天。掠夺者只能摸黑穿过你的兔窝。`,
    carried: (name, held, blurb) => `${name}：包里有 ${held} 个。${blurb}`,
    carriedNone: (name, blurb) => `${name}：没有。${blurb}`,
    trapsLine: (placed, max, held) =>
      `陷阱：地下 ${placed}${max ? ` / ${max}` : ''} 个，棚里 ${held} 个。从「基地」埋设。`,
    trapsBuy: (held, price) => (held > 0
      ? `陷阱：棚里 ${held} 个。再买一个，${price} 胡萝卜。`
      : `陷阱：棚里空了。买一个，${price} 胡萝卜。`),
    trapsBuyBroke: (price) => `陷阱：没有了。一个 ${price} 胡萝卜 - 去挖点回来。`,
    trapsBuyFull: (held) => `陷阱：棚里 ${held} 个。棚子满了。`,
    bottleRunning: (name, wait, count) => `${name}：生效中，还剩${wait}。包里有 ${count} 个。`,
    bottleHeld: (name, count) => `${name}：包里有 ${count} 个。往菜园浇一个。`,
    bottleNone: (name) => `${name}：没有。宝箱里能找到。`,
    watering: '浇水',
    fertiliser: '肥料',
  },

  raid: {
    go: '出发掠夺',
    another: '掠夺另一个兔窝',
    choose: '选一个兔窝',
    whose: '掠夺谁的兔窝？',
    allShielded: '所有兔窝都有护盾',
    nobody: '没人可抢',
    shielded: '有护盾',
    presence: {
      away: '离线',
      home: '在窝里',
      digging: '正在外面挖',
    },
    raidIt: '掠夺',
    brief: '抵达胡萝卜田。他们的陷阱埋在地下，没有标记。',
    outOfEnergy: '体力耗尽',
    nothingTaken: '什么都没拿到',
    unguarded: (amount) => `${amount} 无人看守`,
    nobodyYet: '还没有别人有兔窝。',
    steps: '步',
    looted: (n) => `+${n} 🥕`,
    won: '掠夺成功！',
    backToBurrow: '回到兔窝',
    aRival: '某个对手',
    lootedFrom: (name) => `从${name}那里夺得`,
    wasEmpty: (name) => `${name}的兔窝是空的`,
    trapsSprung: (n) => `进来的路上触发了 ${n} 个陷阱`,
    wonAria: (carrots, name) => `掠夺成功 - 从${name}那里夺得 ${carrots} 根胡萝卜`,
    rabbitAria: '你的兔子在庆祝',
    stolen: (n, name) => `从${name}那里偷到 +${n} 🥕`,
    fellShort: (pct, name) => `在通往${name}菜园 ${pct}% 的地方倒下`,
    defended: '已防守',
    raided: '被掠夺',
    byWho: (who, n) => `被${who} · -${n} 胡萝卜`,
    byWhoNothing: (who) => `被${who}`,
    bounced: (n) => `弹开了 ${n} 次掠夺`,
    struck: '被闪电击中',
    struckBy: (name) => `${name} 召来闪电击中了你`,
  },

  /* ── 你的洞穴正被袭击，从家里看 ───────────────────────────────────────── */
  defend: {
    underAttack: (name) => `${name.toUpperCase()} 正在掠夺你`,
    theirSteps: '对方步数',
    hint: '在它前方埋一颗雷，或点兔子召来闪电。',
    strike: '雷击',
    held: (n) => `持有 ${n}`,
    struckDown: '已击倒',
    ranDry: '对方耗尽了能量',
    looted: (n) => `对方拿走了 ${n} 🥕`,
    lost: '你的洞穴被洗劫了',
    held_: '洞穴守住了',
    incoming: (name) => `${name} 正在掠夺你的洞穴！`,
  },

  raidErrors: {
    fallback: '没成功。',
    target_shielded: '他们的兔窝有护盾。换一个人。',
    cannot_raid_yourself: '那是你自己的兔窝。',
    raid_in_progress: '你已经在一个兔窝里了。',
    cooldown: '你刚刚才掠夺过他们。',
    not_adjacent: '太远了。一步一步来。',
    raid_over: '这次掠夺已经结束了。',
    none_held: '没有闪电可召。小屋有售。',
    no_raid: '这次掠夺已经结束。',
    unknown_player: '他们已经不在了。',
  },

  chest: {
    carrots: '胡萝卜',
    watering: '浇水',
    fertiliser: '肥料',
    bomb: '炸弹',
    shield: '护盾',
    lightning: '闪电',
    genesis: 'RR 创世',
    piece: (amount, label) => `你得到一份 - 另加 ${amount}x ${label}`,
  },

  profile: {
    tabProfile: '资料',
    tabHistory: '记录',
    name: '名字',
    save: '保存名字',
    saving: '保存中...',
    taken: (name) => `以「${name}」游玩`,
    waitingWallet: '等待钱包...',
    signInWith: '用该钱包登录',
    disconnect: '断开连接',
    abandon: '放弃这个兔窝',
    abandonConfirm: '真的放弃？此操作无法撤销',
    loading: '加载中...',
    now: '刚刚',
    historyFailed: '无法加载你的记录。',
    noRuns: '还没有完成过出行。',
    noRaids: '还没有人闯过你的兔窝。',
    noPurchases: '还没从棚子里买过东西。',
    today: '今天',
    youHit: (name) => `你击中了${name}`,
    damage: (n) => `${n} 伤害`,
    spent: (n) => `-${n} 🥕`,
    usd: (n) => `$${n}`,
  },

  avatars: {
    brown: '棕色',
    gray: '灰色',
    orange: '橙色',
    white: '白色',
    yellow: '黄色',
  },

  codex: {
    title: '诅咒之冠',
    aria: '诅咒之冠的故事',
    close: '关闭典籍',
    newChapter: '新章节',
    complete: '已完成',
    isNew: '新',
    sealed: (at, have) => `累计 ${at} 根胡萝卜前封存。你现在有 ${have} 根。`,
    nextIn: (n) => `再挖 ${n} 根胡萝卜解锁下一章`,
    lifetimeOnly: '只看累计胡萝卜。这里的东西谁也抢不走。',
    done: '典籍已完整。岛屿仍在等待。',
    carrotsAt: (n) => `${n} 根胡萝卜`,
    chapterN: (n) => `第 ${n} 章`,
    chapters: '章节',
  },

  quest: {
    claim: '领取',
    done: '完成',
    claimItem: (qty, kind) => `领取 ${qty} 个${kind}`,
    claimCarrots: (n) => `领取 ${n} 🥕`,
    aria: (reward, title) => `${title}的${reward}`,
    progress: (progress, goal) => `${progress}/${goal}`,
    counter: (index, total) => `任务 ${index} / ${total}`,
  },

  taglines: [
    '每一步都可能是最后一步...或者是你的财富',
    '穿过这座岛，夺走黄金，否则死在路上',
    '勇者走得更远 - 幸运者活着回家',
    '一步一步，岛屿或取走，或给予',
    '只有大胆者活下来 - 只有明智者收手',
  ],

  islands: {
    Meadow: '草甸',
    Thicket: '灌木丛',
    Ashland: '灰烬之地',
    Caldera: '火山口',
  },

  items: {
    trap: {
      name: '陷阱',
      blurb: '埋在你的兔窝里。踩上去的掠夺者会被耗干。',
    },
    bomb: {
      name: '炸弹',
      blurb: '在别人出行途中丢到他的岛上。他会知道是你。',
    },
    lightning: {
      name: '闪电',
      blurb: '召来一道雷劈向对手的岛。它会掀开周围的地面。',
    },
    shield: {
      name: '护盾',
      blurb: '生效期间，掠夺会从你的兔窝上弹开。',
    },
    energy: {
      name: '体力',
      blurb: '把条填满，现在就去挖，不用干等。',
    },
    smoke: {
      name: '烟幕',
      blurb: '把你兔窝的数字藏起来一天。掠夺者只能摸黑穿过。',
    },
    mirage: {
      name: '幻影',
      blurb: '让对手出行途中的几个数字说谎。他有可能看出来。',
    },
  },

  quests: {
    'break-ground': {
      title: '破土',
      ask: (tiles) => `挖开 ${tiles} 个格子。`,
      line: '每个挖开的格子都会告诉你有几颗炸弹挨着它。分毫不差。数字是诚实的。',
    },
    'come-home': {
      title: '回家',
      ask: () => '完成一次出行。',
      line: '你带着的东西现在在兔窝里。岛上的一切都够不着它。',
    },
    'bring-it-in': {
      title: '收进来',
      ask: () => '收获菜园。',
      line: '你不在时菜园照样长。贼能扛走的份量也在长。',
    },
    'bury-something': {
      title: '埋点东西',
      ask: () => '在你的地板上放一个陷阱。',
      line: '看不见的陷阱是唯一值得修的墙。墙，人是会绕开的。',
    },
    'open-a-chest': {
      title: '打开一个宝箱',
      ask: () => '在岛上挖出一个宝箱。',
      line: '宝箱是一个承诺。它也是一段走在你还没读懂的地面上的路。',
    },
    'knock-on-a-door': {
      title: '敲一扇门',
      ask: () => '掠夺一个兔窝。挖到哪层都算。',
      line: '能从一只兔子身上拿走的，只有它留在身后的东西。现在两边你都站过了。',
    },
    'look-up': {
      title: '抬头看',
      ask: () => '打开赛季榜。',
      line: '有人戴着那顶王冠。它在每张地图上点起一盏灯，而且从不熄灭。',
    },
    'read-the-stones': {
      title: '读石头',
      ask: (numeral) => `打开典籍第 ${numeral} 章。`,
      line: '岛屿杀的不是倒霉的人。它杀急躁的人，而且把这个差别记得清清楚楚。',
    },
    'hold-the-door': {
      title: '守住门',
      ask: (traps) => `在护盾消失前，让地下有 ${traps} 个陷阱。`,
      line: '你的护盾快没了。之后你只剩这片地板。把它变得昂贵。',
    },
    'the-thicket': {
      title: (island) => `${island}`,
      ask: (carrots) => `累计达到 ${carrots} 根胡萝卜。`,
      line: '更肥的地，也埋着更多东西。岛屿称之为公平交易，并且不等你回答。',
    },
  },

  lore: {
    'the-island': {
      title: '慷慨的岛',
      teaser: '这片地为何如此慷慨。',
      body: [
        '第一根胡萝卜没有人种下。那座岛只是在某个早晨被发现，已经满满当当——'
        + '一排排橙色的冠冕从仍有余温的灰烬里顶出来。发现它的兔子做了合情合理的事。'
        + '他们开始挖。',

        '它从未停止给予。挖一个洞，地里就递上点什么：一根胡萝卜，一个宝箱，'
        + '一块刻着数字的石头。那些数字是诚实的。一向如此。老兔子们提醒你的正是这一点——'
        + '一样从不对你撒谎的东西，是一样有所图的东西，而且它有足够的耐心，'
        + '等到你自己开口问它图什么。',
      ],
    },
    'the-numbers': {
      title: '数字知道什么',
      teaser: '地里记着它埋下的东西。',
      body: [
        '一个挖开的格子会告诉你有几颗炸弹挨着它。不是大概。是分毫不差。'
        + '没有哪只兔子找到过说谎的石头，而兔子们找得很用力，通常还少了一只爪子。',

        '所以危险从来不是运气。危险是你——因为另一只兔子在三格之外，'
        + '伸手去够同一根胡萝卜，你就读得太快。岛屿杀的不是倒霉的人。'
        + '它杀急躁的人，而且把这个差别记得清清楚楚。',
      ],
    },
    'the-burrow': {
      title: '兔窝的法则',
      teaser: '你挖掘时，没人能从你身上拿走什么。',
      body: [
        '在岛上你输不了。踩到炸弹，你会被掀翻、震晕、喘不上气——'
        + '但你那一堆东西分毫未动。你曾扛回家的每一根胡萝卜都还在家里。',

        '问题恰恰在这儿。家是东西都在的地方，也是你不在的地方，'
        + '因为你在这儿，挖着。岛屿把这一点立成了规矩，还觉得非常好笑：'
        + '能从一只兔子身上拿走的，只有它留在身后的东西。',
      ],
    },
    'the-crown': {
      title: '王冠不是奖品',
      teaser: '它在每张地图上标出你。',
      body: [
        '赛季分最高的那只兔子，某天早晨会发现王冠已经等在自己头上。'
        + '摘不下，卖不掉，埋不住，也送不出去。兔子们四样都试过。'
        + '关于第四样有一个章节，很短。',

        '王冠很慷慨，它就是靠这个起作用的。它让佩戴者脚下的地更肥，让宝箱更沉。'
        + '它也在世界地图上点起一盏灯，别的兔子从任何地方都看得见，而且从不熄灭。'
        + '岛屿不奖赏第一名。它照亮他，然后退后一步，看别人会怎么办。',
      ],
    },
    'the-eruption': {
      title: '当一座岛给够了',
      teaser: '这片地要结账了。',
      body: [
        '把一座岛挖得够多，山就会醒。这件事没得商量，掀开的也盖不回去——'
        + '一座岛只发生一次。它一直给，给到自己几乎全是窟窿，'
        + '然后不怎么隆重地沉进水里，兔子们游走。',

        '老兔子们不把这当灾难。他们把它当成一笔结清的账。'
        + '有东西被从世界里取走了，数量惊人，取走它的兔子每一步都被告知了确切的真相，'
        + '而他们选择继续走。岛屿只是停下来，另一座在别处浮起，'
        + '已经满是胡萝卜，已经温热。',
      ],
    },
    'the-sacrifice': {
      title: '献祭',
      teaser: '王冠是为了什么。',
      body: [
        '每个赛季结束时，岛屿都要它的王。不是要胡萝卜——它从来不想要胡萝卜，'
        + '它自己更多。它想要有个人站在最高处，站在所有人都看得见的地方，'
        + '并且已经爱上了站在那儿。',

        '接受的王被体面地下葬，写下自己的遗言，并在世界上留下一座'
        + '任何重置都抹不掉的墓。逃跑的王得到一次诚实的抛硬币——'
        + '岛屿不会作弊，它从未作弊过——然后戴着王冠、被追猎、'
        + '一面护盾也没有地回来，或者干脆再也回不来。',

        '每一次逃跑都让下一枚硬币更冷。岛屿在学。'
        + '它做这件事的时间，比世上有兔子可做的时间还长，'
        + '而且从来不需要提高嗓门：它只是不断把胡萝卜给那些有野心的，然后等着。',
      ],
    },
  },
};
