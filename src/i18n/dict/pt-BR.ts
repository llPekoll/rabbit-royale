/**
 * PORTUGUÊS DO BRASIL.
 *
 * SEM CAIXA ALTA GERAL. O inglês grita porque a fonte do kit não tem
 * minúsculas (ver en.ts); o português cai numa face que tem, então os rótulos
 * são escritos normalmente. As poucas palavras em maiúsculas aqui são as que o
 * fliperama grita em qualquer idioma — os três verbos do chão, o título de um
 * painel — e isso é tom, não limitação técnica.
 *
 * O TOM. A ilha fala seco, na segunda pessoa, sem ênfase. Ela constata. Em
 * português brasileiro isso é "você", nunca "tu" nem "vós", e o imperativo
 * curto que o jogo usa o tempo todo ("Cave.", "Colha.") mantém a mesma
 * brevidade do original.
 *
 * O ORÇAMENTO DE LARGURA É REAL. O português corre 20-30% mais longo que o
 * inglês, e os cartões têm altura fixa com `overflow: hidden`. Onde o original
 * carrega um limite ("doze palavras no máximo"), a tradução foi cortada até
 * caber, não traduzida palavra por palavra.
 */
import type { Dict } from '../dictionaries';

export const ptBR: Dict = {
  units: { s: 's', m: 'min', h: 'h', d: 'd' },

  meta: {
    title: 'Rabbit Royale: A Coroa Amaldiçoada',
    description: 'Campo minado competitivo. Cave, acumule, saqueie, use a coroa.',
  },
  lang: { label: 'Idioma' },
  consent: {
    title: 'Antes de cavar',
    body: 'Podemos medir como você joga? Telas, toques e o anúncio que te trouxe aqui. Isso mostra o que consertar. Nada é vendido.',
    crash: 'Relatórios de falha são sempre enviados: servem só para corrigir bugs.',
    later: 'Mude de ideia quando quiser, no seu perfil.',
    isOn: 'Agora: aceito.',
    isOff: 'Agora: recusado.',
    policy: 'Política de privacidade',
    accept: 'Aceitar',
    refuse: 'Recusar',
    settings: 'Privacidade',
  },

  auth: {
    connect: 'Conectar carteira',
    connecting: 'Cavando...',
    guest: 'Jogar como convidado',
    waiting: 'Aguardando...',
    guestNote: 'Toca de convidado. Conecte uma carteira para mantê-la.',
    noWallet: 'Nenhuma carteira encontrada. Abra no app Rabbit Royale ou instale uma carteira Solana.',
    signInFailed: 'Falha ao entrar',
    guestFailed: 'Não foi possível abrir uma toca de convidado',
    walletTaken: 'Essa carteira já tem uma toca.',
    walletDigsFor: (name) => `Essa carteira já cava para "${name}".`,
    alreadyLinked: 'Esta toca já tem uma carteira.',
    linkFailed: 'Não foi possível conectar essa carteira',
    google: 'Google',
    email: 'E-mail',
    googleWaiting: 'Termine no navegador...',
    cancel: 'Cancelar',
    emailTitle: 'Entrar com e-mail',
    emailAsk: 'Vamos enviar um código de 6 dígitos.',
    emailHint: 'voce@exemplo.com',
    sendCode: 'Enviar código',
    codeSent: (email: string) => `Código enviado para ${email}`,
    codeHint: 'Código de 6 dígitos',
    verifyCode: 'Entrar',
    otherEmail: 'Usar outro endereço',
    invalidEmail: 'Isso não é um e-mail.',
    tooSoon: 'Espere um minuto para pedir de novo.',
    mailFailed: 'O e-mail não foi enviado. Tente de novo.',
    wrongCode: 'Código errado.',
    codeExpired: 'Esse código expirou. Peça outro.',
    tooManyTries: 'Tentativas demais. Peça um novo código.',
    identityTaken: 'Essa conta já tem uma toca.',
    identityDigsFor: (name: string) => `Essa conta já cava para "${name}".`,
    alreadyLinkedProvider: 'Esta toca já tem um.',
    unavailable: 'Ainda não disponível.',
    signInCancelled: 'Login cancelado.',
    saveBurrow: 'Guarde esta toca: conecte Google, um e-mail ou uma carteira.',
    signedInWith: 'Conectado com',
    region: { label: 'Servidor', finding: 'Procurando o servidor mais próximo...', eu: 'Europa', sg: 'Ásia', us: 'Américas' },
  },

  chrome: {
    loading: 'Carregando',
    waking: 'Acordando a coelheira',
    reconnecting: 'Reconectando...',
    back: 'Voltar',
    close: 'Fechar',
    shop: 'Loja',
    story: 'História',
    season: 'TEMPORADA',
    logoAlt: 'Rabbit Royale',
    rotateTitle: 'Vire o celular de lado',
    rotateBody: 'Rabbit Royale se joga na horizontal.',
  },

  install: {
    title: {
      ios: 'Tela de Início',
      macSafari: 'Adicionar ao Dock',
      chromiumDesktop: 'Instalar o app',
      androidChromium: 'Tela inicial',
    },
    line: {
      ios: 'Tela cheia, sem barra do navegador, a um toque da sua Tela de Início.',
      macSafari: 'Rabbit Royale na própria janela, direto do seu Dock.',
      chromiumDesktop: 'Rabbit Royale na própria janela, a um clique do seu dock.',
      androidChromium: 'Tela cheia, sem barra do navegador, a um toque da sua tela inicial.',
    },
    steps: {
      ios: [
        'Toque no botão Compartilhar (no Safari fica na barra de baixo; no Chrome, na barra de endereço).',
        'Role a lista e toque em Adicionar à Tela de Início.',
        'Toque em Adicionar. Rabbit Royale abre em tela cheia pela Tela de Início.',
      ],
      macSafari: [
        'Na barra de menus, escolha Arquivo > Adicionar ao Dock (ou Compartilhar > Adicionar ao Dock).',
        'Clique em Adicionar. Rabbit Royale abre na própria janela pelo Dock.',
        'Precisa do Safari 17 ou mais recente.',
      ],
      prompt: ['Toque em Instalar abaixo e confirme na janela do navegador.'],
      chromiumDesktop: [
        'Clique no ícone de instalação no fim da barra de endereço, ou abra o menu do navegador > Transmitir, salvar e compartilhar > Instalar página como app.',
        'Confirme com Instalar.',
        'Já instalado? O ícone mostra Abrir no app.',
      ],
      androidChromium: [
        'Abra o menu do navegador (os três pontos) e toque em Adicionar à tela inicial.',
        'Toque em Instalar. Rabbit Royale abre em tela cheia pela tela inicial.',
      ],
    },
    install: 'Instalar',
    installing: 'Instalando...',
    showMe: 'Mostrar como',
    gotIt: 'Entendi',
    close: 'Fechar',
    app: 'App',
  },

  sound: {
    group: 'Som',
    music: 'Música',
    effects: 'Efeitos',
    volume: 'Volume',
    game: 'Jogo',
    quality: 'Qualidade',
    pretty: 'BONITO',
    smooth: 'FLUIDO',
    solo: 'Solo',
    soloTicket: 'Não com o Crown Race Ticket',
    soloRaids: 'Solo: sem ataques, nos dois sentidos',
    ambience: 'Ambiente sonoro',
    effectsLong: 'Efeitos sonoros',
    visualQuality: 'Qualidade visual',
    smoothHint: 'Desempenho primeiro',
    prettyHint: 'Luz e sombras',
    soloMode: 'Modo solo',
    soloPlay: 'Jogar solo',
    soloHint: 'Sem ataques, nem recebidos nem feitos.',
    autosaved: 'Alterações salvas automaticamente.',
    soloNext: 'Solo a partir da próxima ilha',
    soloBusy: 'Termine seu ataque primeiro',
    soloCooldown: (wait) => `Solo em ${wait}: você acabou de atacar`,
    on: 'SIM',
    off: 'NÃO',
    settings: 'Ajustes',
    mute: 'Silenciar música',
    unmute: 'Religar música',
    musicOn: 'Música ligada',
    musicOff: 'Música desligada',
  },

  loop: {
    dig: 'CAVAR',
    defend: 'DEFENDER',
    raid: 'SAQUEAR',
    broughtHome: 'trazidas',
    ariaGroup: 'Cavar, toca, saquear',
    ariaDig: (line) => `Cavar. ${line}`,
    ariaDefend: (line) => `Defender: enterrar bombas. ${line}`,
    ariaRaid: (line) => `Saquear. ${line}`,
    energyOf: (energy, max) => `${energy}/${max} de energia`,
    runCosts: (n) => `a travessia custa ${n}`,
    runIn: (wait) => `saída em ${wait}`,
    raidNeeds: (floor, have, wait) => `Um saque pede ${floor} de energia. ${have} agora, o bastante em ${wait}.`,
    raidIn: (wait) => `saque em ${wait}`,
    aMoment: 'um instante',
    gardenPlus: (n) => `horta +${n}`,
    gardenEmpty: 'horta vazia',
    gardenFull: 'cheia',
    shieldFor: (wait) => `escudo ${wait}`,
    shieldBadge: (wait) => `Escudo ${wait}`,
    noShield: 'sem escudo',
    /* Zero é plural em português: "0 bombas". */
    traps: (n) => `${n} bomba${n === 1 ? '' : 's'}`,
    leftOutside: (name, n) => `${name} deixou ${n} lá fora`,
    burrowsOpen: (n) => `${n} toca${n === 1 ? '' : 's'} abert${n === 1 ? 'a' : 'as'}`,
    bombsInBag: (n) => `${n} bomba${n === 1 ? '' : 's'} na bolsa`,
    allShielded: 'todas as tocas com escudo',
  },

  next: {
    label: 'AGORA',
    aria: (text) => `Agora: ${text}`,
    gardenFull: 'Horta quase cheia. Recolha antes que um saqueador recolha.',
    shieldLifts: (wait) => `Escudo cai em ${wait}. Enterre bombas.`,
    raidTarget: (name, garden) => `${name} deixou ${garden} na horta. Saqueie.`,
    dig: (energy) => `${energy} de energia: dá uma saída. Cave.`,
    digPlain: 'Cave.',
    runIn: (wait) => `Uma saída em ${wait}. A horta cresce enquanto isso.`,
  },

  burrow: {
    title: 'SUA TOCA',
    level: (n) => `TOCA NÍV ${n}`,
    maxLevel: 'NÍVEL MÁXIMO',
    levelChip: (level) => `TOCA ${level}`,
    upgrade: 'MELHORAR',
    safe: 'A SALVO',
    exposed: (n) => `${n} EXPOSTAS`,
    garden: 'HORTA',
    harvest: 'COLHER',
    energy: 'ENERGIA',
    gardenGrows: 'A HORTA CRESCE MAIS RÁPIDO',
    gardenAtRisk: (perHour) => `saqueável até a colheita \u00b7 ${perHour}/h`,
    gardenGrowing: (perHour, holds) => `cresce enquanto você cava \u00b7 ${perHour}/h \u00b7 cabe ${holds}`,
    yieldRate: (perHour) => `${perHour} cenouras/h`,
    regenRate: (perHour) => `${perHour} de energia/h`,
  },

  arrange: {
    tip: 'Toque numa árvore, na sua casa ou na sua horta para mudá-la de lugar.',
    place: 'Toque num quadrado claro para colocá-la ali.',
    placeTouch: 'Toque num quadrado claro, ou deslize o dedo até ele e solte.',
    placed: 'Colocado e salvo.',
    undo: 'Desfazer',
    putBack: 'Devolver',
    things: {
      tree: 'Árvore', stump: 'Toco', rock: 'Pedra', bush: 'Arbusto',
      house: 'Sua casa', field: 'Sua horta', thing: 'Decoração',
      mushroom: 'Cogumelo', pebble: 'Pedrinha', grass: 'Tufo de grama', pumpkin: 'Abóbora',
      bone: 'Osso', skullSign: 'Placa de caveira', signpost: 'Placa de direção', scarecrow: 'Espantalho',
      gift_mushroom: 'Cogumelo gigante', gift_pumpkin: 'Abóbora da sorte', gift_carrot: 'Cenoura gigante', gift_scarecrow: 'Espantalho dourado',
    },
    planksBack: (n) => `${n} cerca${n > 1 ? 's' : ''} de volta na bolsa`,
    bombsBack: (n) => `${n} bomba${n > 1 ? 's' : ''} de volta na bolsa`,
    unsaved: 'Não deu para salvar sua toca. Tente de novo daqui a pouco.',
    refused: {
      entrance: 'É a entrada da sua toca: os saqueadores chegam por ali.',
      occupied: 'Já tem algo nesse quadrado.',
      cells_overlap: 'Já tem algo nesse quadrado.',
      field_off_ground: 'A horta precisa ficar em terra firme.',
      field_split: 'A horta precisa ficar num só nível.',
      thing_off_ground: 'Na água, não.',
      field_unreachable: 'Isso fecharia a sua horta: os invasores precisam conseguir chegar.',
      crossing_too_short: (n) => `Perto demais da entrada: são pelo menos ${n} passos até a horta.`,
      crossing_too_long: (n) => `Longe demais: a horta deve ficar a no máximo ${n} passos.`,
      house_off_ground: 'Sua casa precisa de chão livre.',
      under_raid: 'Tem um ataque na sua toca. Reorganize quando acabar.',
      bad_edits: 'Essa organização foi recusada.',
    },
  },

  notes: {
    shieldUp: 'Escudo de pé. Saques ricocheteiam.',
    watered: 'Regada. A horta enche mais rápido.',
    fed: 'Adubada. A horta segura mais.',
    gardenEmpty: 'A horta está vazia. Volte mais tarde.',
    maxDepth: 'Sua toca já está no fundo.',
    shieldAlready: 'Já tem um escudo de pé.',
    noneLeft: 'Acabou. Baús soltam desses.',
    toppedUp: 'Já está cheio. Guarde para depois.',
    refilled: 'Energia cheia. Bora cavar.',
    noRefill: 'Nenhuma recarga guardada. A loja vende.',
    islandSilent: 'A ilha não respondeu. Tente de novo daqui a pouco.',
    runResumed: 'De volta à sua partida.',
    reconnecting: 'Reconectando... tente daqui a pouco.',
    harvested: (n) => `+${n} 🥕`,
    needMore: (n) => `Faltam ${n} 🥕`,
    questDone: (title) => `Missão concluída: ${title}`,
  },

  run: {
    goFarm: 'Limpar todas as bombas',
    findMe: 'Achar meu coelho',
    retreat: 'Recuar',
    home: 'Toca',
    stopWatching: 'Parar de assistir',
    theirRun: 'a saída deles',
    chests: (taken: number, total: number) => `${taken}/${total} baús`,
    chestsTitle: 'Baús pegos nesta ilha — por todos nela. Pegue todos e ela afunda.',
    watching: (label) => `👁 assistindo ${label}`,
    /** The run's energy bar, read aloud. */
    energy: (n, max) => `${n} de ${max} de energia`,
    /** The red X — see FLAG in tuning. */
    markBomb: 'Marcar uma bomba',
    markHint: 'Toque numa casa para pôr um X vermelho · certo: +energia · errado: -energia',
    markCancel: 'Cancelar',
    markNothing: 'Nada para marcar aqui: todas as casas ao seu redor já foram lidas.',
    energyLow: 'Energia baixa. Um X vermelho certo numa bomba devolve um pouco.',
    energyRaidLeft: 'Ainda há energia para um saque. Volte, ou continue.',
    homeRaid: 'Voltar e saquear',
    crossed: (cost, energy) => `\u26a1 -${cost} na travessia \u00b7 ${energy} sobrando`,
    trapHint: (left) => `Toque num quadrado para enterrar uma bomba, numa bomba para tirar · restam ${left}`,
    trapHintEmpty: 'Sem bombas · compre outra, ou toque numa bomba para tirar e enterrar noutro lugar',
    strike: 'Raio',
    aiming: 'Toque num rival para eletrocutá-lo',
    strikeNone: 'Sem raio para chamar. A loja vende.',
    plant: 'Plantar bomba',
    aimingPlant: 'Toque num chão não cavado para enterrar uma bomba',
    plantNone: 'Sem bombas para plantar. A loja vende.',
    planted: 'Bomba enterrada. Só você sabe onde.',
    plantRefused: {
      'off-island': 'Fora da ilha.',
      revealed: 'Esse chão já foi cavado.',
      hinted: 'O tabuleiro já diz que essa casa é segura.',
      chest: 'Não embaixo de um baú.',
      'too-many': 'Três bombas ativas é o máximo aqui.',
    } as Record<string, string>,
    plantedBy: (name) => `Bomba de ${name}!`,
    struckBy: (name) => `${name} te eletrocutou`,
    watchers: (n) => `${n} online`,
    hitBolt: (name) => `${name} te eletrocutou`,
    hitBomb: (name) => `Bomba oculta de ${name}`,
    bloop: 'Bloop',
    aimingBloop: 'Toque num rival para entintá-lo',
    bloopNone: 'Nenhum bloop para lançar. A loja vende.',
    bloopRefused: {
      'no-rival': 'Ninguém ali para entintar.',
      level_locked: 'Só a partir do nível 3.',
      'none-held': 'Acabaram os bloops.',
    } as Record<string, string>,
    hitBloop: (name) => `${name} te entintou`,
    buyArms: 'Comprar',
    inkedStay: (s) => `Tinta nos olhos · volta em ${s}s`,
  },

  firstRun: {
    tap: 'Toque num quadrado ao seu lado para cavar.',
    numbers: 'O número conta as bombas que encostam nesse quadrado.',
    counts: 'Este 1 quer dizer: uma bomba se esconde nos quadrados ao redor.',
    prove: 'Só resta um quadrado fechado. É a bomba.',
    mark: 'Aperte MARCAR UMA BOMBA e toque no quadrado com o X vermelho.',
    aim: 'Agora toque no quadrado que está piscando.',
    marked: 'Certo! Um bom X devolve energia. Um errado custa caro.',
    fetch: 'Agora vá pegar o baú. O que tiver dentro vai para casa com você.',
    bomb: 'Isso custou energia. O 1 apontava para ela.',
    golden: 'Ouro! Uma cenoura dourada vale cinco.',
    chest: 'Um baú. O que tiver dentro vai para casa com você.',
    clock: 'A ilha é o relógio. Cave até o fim e ela afunda.',
    recap: 'Suas cenouras já estão em casa. Vá ver.',
  },

  recap: {
    record: (island, n, previous) => previous ? `RECORDE em ${island}: ${n} \ud83e\udd55 (antes ${previous})` : `PRIMEIRO RECORDE em ${island}: ${n} \ud83e\udd55`,
    cleared: 'ILHA LIMPA!',
    over: 'FIM DA SAÍDA',
    clearedNote: 'Todos os baús saíram do chão. O mar levou o resto.',
    overNote: 'Sem energia.',
    tutorialDone: 'VOCÊ PEGOU!',
    tutorialDoneNote: 'O baú era a ilha inteira. Suas cenouras esperam na toca.',
    stats: (carrots, dug, bombs, time) => `🥕 ${carrots} · ${dug} cavados · 💣 ${bombs} · ${time}`,
    bank: (energy, max, cost) => `⚡ ${energy}/${max} de energia · a travessia custa ${cost}`,
    raidLeft: (energy) => `⚡ ${energy} de energia: dá para um saque`,
    getEnergy: 'Pegar mais energia',
    goHome: (carrots) => `Toca · guardar ${carrots} 🥕`,
    shoved: 'NA ÁGUA!',
    struck: 'ELETROCUTADO!',
    shovedNote: (name) => `${name} te empurrou na água.`,
    struckNote: (name) => `${name} te eletrocutou com um raio.`,
    shovedNoteAnon: 'Alguém te empurrou na água.',
    struckNoteAnon: 'Alguém te eletrocutou com um raio.',
  },
  shove: {
    by: (name) => `${name} te empurrou!`,
    anon: 'Alguém te empurrou!',
  },

  revenge: {
    struck: (name) => `${name} te eletrocutou!`,
    inked: (name) => `${name} te encheu de tinta!`,
    strike: 'Revidar',
  },

  snack: {
    keepWeek: 'Perder um dia não reinicia sua semana.',
    title: 'Snack Time',
    dayOf: (day) => `Dia ${day}`,
    day: (day) => `Dia ${day}`,
    ready: 'Sua caixa surpresa está pronta!',
    take: 'Pegar',
    nextIn: (wait) => `Próxima caixa em ${wait}`,
    tomorrow: (n) => `Amanhã: ${n} cenouras`,
    tomorrowPack: 'Amanhã: Magic Hat ou Lucky Foot!',
    pick: 'Dia 7: escolha um!',
    choose: 'Escolher',
    hat: 'Magic Hat',
    hatWhat: 'Ataque',
    foot: 'Lucky Foot',
    footWhat: 'Defesa',
    got: (n) => `+${n} cenouras!`,
    gotPack: (name) => `${name} é seu!`,
    weekDone: 'Semana completa! Uma nova começa amanhã.',
    notReady: 'Já pegou hoje. Volte amanhã!',
    today: 'Hoje',
    taken: 'Pego',
    ruleShort: 'Um lanche por dia. No dia 7, escolha um pacote!',
    or: 'ou',
    pickOne: 'Escolha 1 de 2',
    box: {
      ready: 'Sua caixa surpresa está pronta!',
      golden: 'CAIXA DOURADA - chances melhores!',
      tomorrow: 'A caixa de amanhã',
      open: 'Abrir',
      next: (wait) => `Próxima caixa em ${wait}`,
      day: 'DIA',
      today: 'hoje',
      taken: 'pego',
      giftOn: (day, name) => `PRESENTE DO DIA ${day}: ${name}`,
      decoration: 'decoração da toca',
      dayN: (day) => `DIA ${day}`,
      allGifts: 'Todos os presentes são seus!',
      unlocked: (name) => `DESBLOQUEADO: ${name} - já está na sua toca!`,
      goldenToday: 'A caixa de hoje é DOURADA',
      goldenIn: (n) => `Caixa dourada a cada 7 dias - próxima em ${n} dia${n === 1 ? '' : 's'}`,
      neverResets: 'perder um dia nunca zera seu progresso',
      inside: 'O QUE TEM DENTRO',
      goldenTag: 'CAIXA DOURADA',
      tier: { common: 'Comum', rare: 'Rara', epic: 'Épica', jackpot: 'Jackpot' },
      detail: { carrots: (n) => `+${n} cenouras`, rare: 'item', epic: 'pacote', jackpot: 'skin' },
      buffTitle: 'BÔNUS DO DIA · BARRIGA CHEIA',
      buffBody: (max) => `Sua 1ª partida de hoje rende o dobro (até +${max}).`,
      buffIdle: 'Começa quando você abre a caixa',
      buffActive: 'ATIVO até a meia-noite - vá cavar!',
      buffUsed: (n) => `Usado hoje: +${n} cenouras`,
      gift: { mushroom: 'Cogumelo gigante', pumpkin: 'Abóbora da sorte', carrot: 'Cenoura gigante', scarecrow: 'Espantalho dourado' },
      prize: {
        carrots: 'Cenouras', water: 'Regador', fertiliser: 'Adubo', lightning: 'Raio',
        shield: 'Escudo', energy: 'Tanque cheio', magic_hat: 'Magic Hat', lucky_foot: 'Lucky Foot',
        skin_solana: 'Skin Solana', skin_carrot: 'Skin Cenoura',
      },
    },
  },

  pass: {
    title: 'Crown Race Ticket',
    show: 'Crown Race Ticket',
    buy: 'Comprar',
    soon: 'Em breve',
    soonTag: 'EM BREVE',
    short: 'Crown Race',
    left: (n) => `${n} dias restantes`,
    days: (n) => `${n} dias`,
    race: 'A corrida pelo pote',
    raceWhat: (share, n) => `Os ${n} melhores com o ticket dividem ${share} do pote`,
    skin: "Coelho dourado",
    skinWhat: 'Seu para sempre, na ilha e na toca',
    inRace: 'Você está na corrida',
    pool: 'Prêmio',
    poolLine: (share, pot, holders) => `${share} de ${pot} · ${holders} com ticket`,
    active: 'Ticket ativo',
    bought: 'Ticket comprado! Boa sorte na corrida.',
    you: (rank, prize) => `Você: #${rank} · ${prize}`,
    unranked: 'Pontue nesta temporada para entrar na corrida',
    empty: 'Ninguém com ticket pontuou ainda. Seja o primeiro!',
    closed: 'Nenhum ticket à venda agora',
    connect: 'Conecte uma carteira para comprar o ticket',
    ending: 'Vendas encerradas: a temporada termina em menos de uma hora',
    owned: 'Você já tem o ticket desta temporada',
    terms: 'Os prêmios são pagos em USDC na sua carteira quando a temporada termina.',
  },

  pill: {
    banked: (n) => `${n} cenouras guardadas`,
    carryNote: 'Carregadas nesta saída: guardadas ao voltar para casa',
    carrying: (n) => `${n} cenouras carregadas, ainda não guardadas`,
    leading: 'na frente',
    rankFirst: 'Posição na temporada #1: liderando',
    rank: (rank, gap) => `Posição #${rank}: ${gap} pontos para passar o #${rank - 1}`,
    toPass: (gap, rank) => `${gap} para o #${rank - 1}`,
    showClimb: (n, rank) => `${n} cenouras guardadas, posição #${rank}. Mostrar quanto falta para subir`,
    hideClimb: (n, rank) => `${n} cenouras guardadas, posição #${rank}. Esconder quanto falta para subir`,
  },

  board: {
    show: 'Mostrar o placar da temporada',
    hide: 'Esconder o placar da temporada',
    diggingNow: 'cavando agora · toque para assistir',
    watch: (name) => `Assistir ${name} cavar`,
    notOut: (name) => `${name} não está lá fora agora`,
  },

  shop: {
    title: 'LOJA',
    shed: 'LOJA',
    aria: 'Loja',
    protect: 'PROTEGER A TOCA',
    protectAria: 'Proteger sua toca',
    protectBuyAria: 'Proteger sua toca - comprar uma bomba',
    noTraps: 'SEM BOMBAS - PEGUE UMA',
    nothingBuried: 'NADA ENTERRADO',
    inShed: (n) => `${n} NA BOLSA`,
    rearming: (n) => `REARMANDO - ${n} VOLTANDO`,
    upAndRearming: (armed, rearming) => `${armed} DE PÉ - ${rearming} REARMANDO`,
    inGround: (armed, max) => `${armed}/${max} NO CHÃO`,
    openShed: 'Abrir a loja',
    backToBurrow: 'Voltar para a toca',
    payWith: 'Pagar com',
    outOfEnergy: 'SEM ENERGIA',
    energySay: (cost, wait) =>
      `A travessia custa ${cost}. Essa energia volta sozinha em ${wait}.`
      + ' Ou recarregue agora e continue cavando.',
    energySayEmpty: (wait) =>
      `Sem energia. Um ponto volta sozinho em ${wait}.`
      + ' Ou recarregue agora e continue cavando.',
    fillsTo: (max) => `Recarrega sua energia até ${max}.`,
    noRefills: ' Sem recargas hoje.',
    noRefillsUntil: (wait) => ` Utilizáveis de novo em ${wait}.`,
    inBag: (n) => (n > 0 ? ` ${n} guardadas.` : ' Nenhuma guardada.'),
    useRefill: 'Usar uma recarga',
    refillsLeft: (n) => (n > 0 ? ` ${n} recarga${n > 1 ? 's' : ''} hoje.` : ' Sem recargas hoje.'),
    cardsOff: 'Pagamento com cartão ainda não está ligado. Só cenouras por enquanto.',
    connectForCard: 'Conecte uma carteira para pagar com cartão. Tudo aqui também se cava.',
    eitherWay: 'Cenouras que você cava, ou cartão. A mercadoria é a mesma.',
    pricing: 'Calculando preço...',
    approve: 'Aprove na sua carteira...',
    confirming: 'Confirmando na rede...',
    priceLabel: (price) => `${price} cenouras`,
    buy: (name, price) => `Comprar ${name} por ${price}`,
    capped: (name, price) => `${name}: ${price}. Você já carrega o máximo.`,
    /** The price button, armed: a second press buys. */
    confirmBuy: 'CONFIRMAR?',
    yours: 'É SEU!',
    tooPoor: (name, price) => `${name}: ${price}. Cenouras insuficientes. Vá cavar.`,
    heldOf: (held, cap) => `${held}/${cap}`,
    heldToday: (n) => `${n} hoje`,
    heldBackIn: (wait) => `em ${wait}`,
    heldDaysLeft: (n) => `${n}d restantes`,
    heldOff: 'desligado',
    max: 'MÁX',
    /* A pack that will not fit: one of its items would overflow the bag. */
    bagFull: 'CHEIO',
    active: 'ATIVO',
    boughtEnergy: (paid) => `Recarga guardada. ${paid}`,
    boughtTrap: (n, paid) => `${n > 1 ? `${n} bombas` : 'Bomba'} na bolsa. ${paid}`,
    boughtBomb: (n, paid) => `${n > 1 ? `${n} bombas armadas` : 'Bomba armada'}. ${paid}`,
    boughtLightning: (n, paid) => `${n > 1 ? `${n} raios` : 'Raio'} engarrafado${n > 1 ? 's' : ''}. ${paid}`,
    boughtShield: (n, paid) => `${n > 1 ? `${n} escudos prontos` : 'Escudo pronto'}. ${paid}`,
    boughtSmoke: (paid) => `Os números estão escondidos. ${paid}`,
    boughtBloop: (n, paid) => `${n > 1 ? `${n} bloops` : 'Bloop'} no pote. ${paid}`,
    boughtMirage: (n, paid) => `${n > 1 ? `${n} miragens prontas` : 'Miragem pronta'} para jogar. ${paid}`,
    /* Uma cerca é LEVANTADA: o que se compra é uma tábua que fecha um trecho da
       borda da horta, então o recibo nomeia aquilo em que ela se transforma. */
    boughtFence: (n, paid) => `${n > 1 ? `${n} cercas prontas` : 'Cerca pronta'} para levantar. ${paid}`,
    boughtPack: (name, paid) => `${name}: tudo na bolsa. ${paid}`,
    paid: (spent) => `-${spent} 🥕`,
  },

  shopErrors: {
    fallback: 'Não deu certo.',
    insufficient_carrots: 'Cenouras insuficientes.',
    inventory_full: 'Sua bolsa está cheia desses.',
    bag_full: 'Um dos itens não cabe mais na sua bolsa.',
    daily_energy_limit: 'Sem mais recargas hoje. A horta continua crescendo.',
    tank_full: 'Sua energia já está cheia. Guarde a recarga para depois.',
    smoke_capped: 'Sua toca está escondida pelo máximo de tempo possível.',
    too_many_at_once: 'Demais de uma vez.',
    bad_quantity: 'Isso não é uma quantidade.',
    no_traps: 'Sem bombas. Compre uma, ou espere amanhã.',
    board_full: 'Sua toca não cabe mais uma bomba.',
    tile_not_trappable: 'Nenhuma bomba pode ir aí.',
    tile_doorstep: 'Perto demais da porta. Os primeiros passos ficam livres.',
    tile_house: 'Nada fica enterrado debaixo da sua casa.',
    tile_field: 'Nada fica enterrado na sua horta.',
    tile_already_trapped: 'Já tem uma bomba aí.',
    no_trap_there: 'Não tem bomba aí.',
    no_fences: 'Sem cercas. A loja vende.',
    span_already_fenced: 'Já tem uma cerca aí.',
    span_not_exposed: 'Isso não é uma borda da sua horta.',
    /* A regra do portão, dita como regra e não como erro: é a única recusa
       daqui que o jogador precisa APRENDER, então ela diz por que antes de
       dizer não. */
    would_seal_burrow: 'Isso fecharia a última entrada. Uma entrada fica aberta como portão.',
    span_not_fenced: 'Não tem cerca aí.',
    bad_span: 'Isso não é lugar para uma cerca.',
    /* Não é a recusa do dono, e sim a do SAQUEADOR, vinda de raid/route.ts —
       a cerca é a única defesa que ele enxerga, então ela o orienta. */
    fenced: 'Uma cerca bloqueia o caminho. Contorne.',
    payments_unavailable: 'Pagamento com cartão ainda não está configurado.',
    quote_expired: 'Essa cotação expirou. Tente de novo.',
    signature_already_used: 'Esse pagamento já foi usado.',
    not_confirmed_yet: 'Ainda confirmando na rede...',
    wrong_reference: 'Essa transação não corresponde a esta compra.',
    no_matching_transfer: 'Nenhuma transferência USDC correspondente.',
    failed_on_chain: 'A transação falhou na rede.',
    rpc_unavailable: 'A rede Solana não está respondendo. Tente de novo em instantes.',
    no_price_for_token: 'Sem cotação para este token agora. Tente com USDC.',
    unknown_item: 'Isso não está à venda.',
  },

  pay: {
    needsBuild: 'Pagar pelo app depende da próxima versão. Compre com cenouras por ora.',
    noWallet: 'Nenhuma carteira Solana encontrada. Instale a Phantom para pagar com USDC.',
    notConfigured: 'Pagamentos não estão configurados neste servidor.',
    stillConfirming: 'Pago, mas ainda confirmando. Reabra a loja em um minuto. Nada se perde.',
    failed: 'Pagamento falhou',
    notEnough: (amount: string, symbol: string) => symbol + ' insuficiente: custa ' + amount + ' ' + symbol + '.',
    noToken: (symbol: string) => 'Nenhum ' + symbol + ' nesta carteira. Tente outra moeda.',
    linkWallet: 'Vincule uma carteira à sua toca para pagar com dinheiro.',
    expired: 'Esse preço expirou. Toque de novo para um novo.',
  },

  kit: {
    tools: {
      more: 'Ver efeito e ações', less: 'Recolher detalhes',
      available: (n) => n + ' disponíveis',
      placed: (n) => n + ' colocados',
      active: (time) => time + ' restantes',
      buyTrap: (price) => 'Comprar bomba - ' + price + ' cenouras',
      trapHint: 'Toque numa casa para enterrar. Toque na bomba para recuperar.',
      trapEmpty: 'Recupere uma bomba ou compre uma abaixo.',
      fenceHint: 'Toque numa borda iluminada para construir. Toque na cerca para recuperar.',
      raiseShield: 'Usar um escudo', shieldActive: 'Sua toca já está protegida.',
      shopHint: 'Disponível na loja.', notEnough: 'Faltam cenouras para outra bomba.',
      smokeHint: 'Comprar fumaça na loja ativa o efeito imediatamente.',
      attackHint: 'Use na ilha de um rival durante uma partida.',
      chestHint: 'Encontre mais nos baús.',
      waterEffect: 'Faz sua horta crescer mais rápido por um tempo.',
      fertiliserEffect: 'Permite que a horta armazene mais cenouras antes de encher.',
      water: 'Usar uma rega', fertilise: 'Usar um fertilizante',
    },
    aria: 'O que você está carregando',
    groupDefence: 'DEFESA',
    groupAttack: 'ATAQUE',
    groupGarden: 'HORTA',
    shieldHolding: (wait, held) => `Escudo: de pé, restam ${wait}. ${held} na bolsa.`,
    shieldReady: (held) => `Escudo: ${held} na bolsa. Levante um. Saques ricocheteiam enquanto durar.`,
    shieldNone: 'Escudo: nenhum. Compre um na loja.',
    smokeOff: 'Cortina de fumaça: desligada. Compre uma na loja para esconder seus números.',
    smokeUp: (days) =>
      `Cortina de fumaça: de pé, ${days} dia${days === 1 ? '' : 's'} restante${days === 1 ? '' : 's'}.`
      + ' Saqueadores atravessam sua toca às cegas.',
    carried: (name, held, blurb) => `${name}: ${held} na bolsa. ${blurb}`,
    carriedNone: (name, blurb) => `${name}: nenhum. ${blurb}`,
    trapsLine: (placed, max, held) =>
      `Bombas: ${placed}${max ? ` de ${max}` : ''} no chão, ${held} na bolsa.`
      + ' Enterre pelo DEFENDER.',
    trapsBuy: (held, price) =>
      (held > 0
        ? `Bombas: ${held} na bolsa. Compre outra por ${price} cenouras.`
        : `Bombas: nenhuma na bolsa. Compre uma por ${price} cenouras.`),
    trapsBuyBroke: (price) =>
      `Bombas: nenhuma. Uma custa ${price} cenouras - va cavar mais.`,
    trapsBuyFull: (held) => `Bombas: ${held} na bolsa. A bolsa está cheia.`,
    bottleRunning: (name, wait, count) => `${name}: em curso, restam ${wait}. ${count} na bolsa.`,
    bottleHeld: (name, count) => `${name}: ${count} na bolsa. Despeje uma na horta.`,
    bottleNone: (name) => `${name}: nenhuma. Encontradas em baús.`,
    /* A CASA DA CERCA. Uma cerca é uma tábua sobre um trecho da borda da horta.
       `total` são todos os trechos, portão incluído, como quem chama
       (kit-row.tsx) os conta: o último nunca pode ser fechado, e fenceAllWalled
       diz isso em vez de deixar a conta ler como uma tábua que o jogador deixou
       de levantar. */
    fencePlace: (held, walled, total) =>
      `Cercas: ${held} na bolsa, ${walled} de ${total} borda${total === 1 ? '' : 's'} fechada${walled === 1 ? '' : 's'}.`
      + ' Levante uma.',
    /* Não é falha, por isso o portão é dito na cara: o jogador fez tudo o que o
       item permite, e um "não dá mais" leria como um limite a ser vencido. */
    fenceAllWalled: (walled) =>
      `Cercas: ${walled} borda${walled === 1 ? '' : 's'} fechada${walled === 1 ? '' : 's'}.`
      + ' A última entrada é o portão e fica aberta.',
    /* Nomeia o caminho de volta a uma tábua quando a bolsa está vazia: uma tábua
       levantada não foi gasta, é só tocar nela para pegá-la de volta. */
    fenceNone: (walled) =>
      `Cercas: nenhuma na bolsa, ${walled} borda${walled === 1 ? '' : 's'} fechada${walled === 1 ? '' : 's'}.`
      + ' A loja vende. Toque numa cerca para pegá-la de volta.',
    watering: 'Rega',
    fertiliser: 'Adubo',
  },

  energyPanel: {
    open: 'Detalhes da energia',
    title: 'ENERGIA',
    reserve: (n) => (n === 1 ? '1 recarga guardada' : `${n} recargas guardadas`),
    usableToday: (n) => `${n} para usar hoje`,
    buyMore: 'Comprar mais',
    reading: (energy, max) => `${energy}/${max}`,
    rate: (regen) => `+${regen}/h`,
    full: 'cheia',
    fullIn: (wait) => `cheia em ${wait}`,
    island: 'Ilha',
    islandCost: (cost) => `${cost} para atravessar, depois 1 por escava\u00e7\u00e3o`,
    raid: 'Saque',
    raidCost: (toll, stake) => `${toll} na travessia, no m\u00e1ximo ${stake}`,
    raidRefund: 'Chegue à horta e seus passos voltam.',
    dig: 'Escavar',
    digCost: (dig, bomb) => `${dig} por casa. Uma bomba: ${bomb}`,
    x: 'X vermelho',
    xCost: (lo, hi, loss) => `certo: +${lo} a +${hi}. Errado: -${loss}`,
    home: 'Voltar',
    homeCost: (floor) => `volte com ${floor} ou mais e um saque est\u00e1 pronto`,
    homeHint: 'A energia que voc\u00ea leva para casa fica guardada.',
    ready: 'Pronto',
    raidReady: 'Saque pronto',
    needs: (floor) => `Pede ${floor}`,
    inWait: (wait) => `em ${wait}`,
    under: (floor) => `Abaixo de ${floor}`,
    levelLabel: (level) => `Toca ${level}`,
    levelRate: (regen, next) =>
      next === null ? `recarrega ${regen} por hora` : `recarrega ${regen} por hora. Pr\u00f3ximo n\u00edvel: ${next}`,
  },
  rabbitLevel: {
    badge: (n: number) => `NV. ${n}`,
    up: (n: number) => `NÍVEL ${n}`,
    harder: 'As ilhas ficam mais difíceis',
    final: 'As ilhas finais',
    raidsOpen: 'Os ataques estão abertos',
    raidLocked: (n: number) => `Ataques abrem no nível ${n}. Termine ilhas para chegar lá.`,
  },
  islandPick: {
    choose: 'Escolher uma ilha',
    which: 'QUAL ILHA?',
    loading: 'Olhando o mar...',
    row: (rabbits, left, total, dug) => `${rabbits} cavando \u00b7 ${left}/${total} ba\u00fas \u00b7 ${dug}% cavada`,
    rowEmpty: (left, total, dug) => `ningu\u00e9m nela agora \u00b7 ${left}/${total} ba\u00fas \u00b7 ${dug}% cavada`,
    fresh: 'Ningu\u00e9m nela ainda',
    join: 'Entrar',
    open: 'Abrir',
    locked: (n) => `Abre com ${n} cenouras cavadas`,
    lockedShort: 'Fechada',
    brief: 'Uma ilha cheia \u00e9 uma escava\u00e7\u00e3o curta e segura com parte dos ba\u00fas. Uma ilha nova \u00e9 a corrida longa.',
    almostDone: 'quase acabando',
    best: (n) => `seu recorde ${n} \ud83e\udd55`,
    gone: 'Essa ilha encheu ou acabou. Escolha outra.',
    tierLocked: 'Voc\u00ea ainda n\u00e3o cavou at\u00e9 essa ilha.',
    youHave: (n) => `você tem ${n}`,
    tier: (bombs, x) => `${bombs}% de bombas · um X certo +${x}`,
  },
  raid: {
    go: 'IR SAQUEAR',
    another: 'Saquear outra toca',
    choose: 'Escolha uma toca',
    whose: 'TOCA DE QUEM?',
    cost: (toll, stake) => `A travessia de um saque custa ${toll} de energia, no máximo ${stake}.`,
    allShielded: 'TODAS AS TOCAS COM ESCUDO',
    nobody: 'NINGUÉM PARA ROUBAR',
    shielded: 'Com escudo',
    presence: {
      away: 'ausente',
      home: 'na toca',
      digging: 'cavando fora',
    },
    raidIt: 'Saquear',
    watchIt: 'Assistir',
    brief: 'Alcance a horta deles. As bombas deles estão enterradas e sem marca.',
    outOfEnergy: 'Sem energia',
    nothingTaken: 'Nada levado',
    unguarded: (amount) => `${amount} SEM GUARDA`,
    nobodyYet: 'Ninguém mais tem uma toca ainda.',
    steps: 'passos',
    stepsBack: (n) => `Horta alcançada: seus ${n} passos voltam`,
    looted: (n) => `+${n} 🥕`,
    won: 'SAQUE VENCIDO!',
    backToBurrow: 'DE VOLTA À TOCA',
    aRival: 'UM RIVAL',
    lootedFrom: (name) => `SAQUEADO DE ${name}`,
    wasEmpty: (name) => `A TOCA DE ${name} ESTAVA VAZIA`,
    trapsSprung: (n) =>
      n === 1 ? '1 BOMBA EXPLODIU NA ENTRADA' : `${n} BOMBAS EXPLODIRAM NA ENTRADA`,
    wonAria: (carrots, name) => `Saque vencido - ${carrots} cenouras levadas de ${name}`,
    rabbitAria: 'Seu coelho, comemorando',
    stolen: (n, name) => `+${n} 🥕 roubadas de ${name}`,
    fellShort: (pct, name) => `Caiu a ${pct}% do caminho até a horta de ${name}`,
    defended: 'DEFENDIDA',
    raided: 'SAQUEADA',
    byWho: (who, n) => `POR ${who} · -${n} CENOURAS`,
    byWhoNothing: (who) => `POR ${who}`,
    bounced: (n) => `${n} SAQUE${n === 1 ? '' : 'S'} RICOCHETEARAM`,
    struck: 'Eletrocutado',
    struckBy: (name) => `${name} te eletrocutou`,
    smoked: 'Cortina de fumaça: sem números aqui. Ande às cegas.',
  },

  /* ── Sua toca sob ataque, vista de casa ──────────────────────────────── */
  defend: {
    clean: 'TIRAR TUDO',
    cleanSure: 'CERTEZA?',
    cleaned: (bombs, planks) => `${bombs} bomba${bombs > 1 ? 's' : ''} e ${planks} cerca${planks > 1 ? 's' : ''} de volta na bolsa`,
    underAttack: (name) => `${name.toUpperCase()} ESTÁ SAQUEANDO VOCÊ`,
    theirSteps: 'passos dele',
    hint: 'Enterre uma bomba na frente dele, ou toque no coelho para eletrocutá-lo.',
    strike: 'Raio',
    buyStrike: 'Comprar e eletrocutar',
    held: (n) => (n === 1 ? '1 na bolsa' : `${n} na bolsa`),
    struckDown: 'ELETROCUTADO',
    ranDry: 'FICOU SEM ENERGIA',
    looted: (n) => `LEVARAM ${n} 🥕`,
    lost: 'Sua toca foi saqueada',
    held_: 'Toca defendida',
    incoming: (name) => `${name} está saqueando sua toca!`,
  },

  raidErrors: {
    fallback: 'Não deu certo.',
    target_shielded: 'A toca deles está com escudo. Tente outra pessoa.',
    target_solo: 'Essa pessoa está jogando solo.',
    solo_mode: 'Você está jogando solo. Desative nas configurações para atacar.',
    cannot_raid_yourself: 'Essa é a sua própria toca.',
    raid_in_progress: 'Você já está dentro de uma toca.',
    cooldown: 'Você saqueou essa pessoa faz pouco tempo.',
    no_energy: 'Energia insuficiente para a travessia. Espere, ou recarregue.',
    not_adjacent: 'Longe demais. Um passo por vez.',
    raid_over: 'Esse saque já acabou.',
    none_held: 'Sem raio para chamar. A loja vende.',
    no_raid: 'Esse saque acabou.',
    unknown_player: 'Sumiram.',
  },

  chest: {
    carrots: 'CENOURAS',
    watering: 'REGA',
    fertiliser: 'ADUBO',
    bomb: 'BOMBA',
    shield: 'ESCUDO',
    lightning: 'RAIO',
    genesis: 'RR GENESIS',
    piece: (amount, label) => `UMA PARTE É SUA - MAIS ${amount}x ${label}`,
  },

  skins: {
    carrotDescription: "Pelagem laranja. Orelhas verdes. Direto da horta.",
    ticketOnly: "Este não pode ser comprado: só vem com o Crown Race Ticket.",
    title: "Skins",
    description: "Violeta elétrico. Orelhas menta. Seu coelho Solana.",
    permanent: "Uma compra. Seu para sempre.",
    cosmetic: "Apenas aparência",
    owned: "Adquirida",
    equip: "Equipar",
    equipped: "Equipada",
    buy: "Comprar",
    confirm: "Confirmar",
    check: "Verificar compra",
    recovering: "Verificando sua compra...",
    pending: "Há uma compra pendente. Verifique antes de pagar de novo; uma cotação não paga expira em 15 minutos.",
    unavailable: "As compras estão indisponíveis no momento.",
    guest: "Conecte sua carteira para guardar esta skin na sua conta.",
    loadFailed: "Não foi possível carregar suas skins.",
    retry: "Tentar de novo",
    success: "Desbloqueado! Você já pode equipar.",
    free: "Pelagem grátis",
    wait: "Um instante...",
    checked: "Nenhuma compra pendente. Pode tentar de novo.",
    equipFailed: "Não foi possível equipar esta skin. Tente de novo.",
    idle: "Parado",
    move: "Correr",
    happy: "Celebrar",
    preview: "Prévia das animações do jogo",
    back: "Voltar aos coelhos",
  },

  profile: {
    /* The panel's own heading. The tabs below it say Profile and History,
       so the header names the panel, not the open tab. */
    title: 'PERFIL',
    tabProfile: 'Perfil',
    tabHistory: 'Histórico',
    name: 'Nome',
    save: 'Salvar nome',
    saving: 'Salvando...',
    taken: (name) => `Jogar como "${name}"`,
    waitingWallet: 'Aguardando a carteira...',
    signInWith: 'Entrar com essa carteira',
    disconnect: 'Desconectar',
    abandon: 'Abandonar esta toca',
    abandonConfirm: 'Abandonar mesmo? Isso não tem volta',
    deleteAccount: 'Excluir conta',
    deleteConfirm: 'Toque de novo: apagar tudo',
    loading: 'Carregando...',
    now: 'agora',
    historyFailed: 'Não foi possível carregar seu histórico.',
    subtitle: 'Personalize seu coelho e proteja sua toca.',
    historySubtitle: 'Suas colheitas, ataques e compras recentes.',
    playerName: 'Nome do jogador',
    saveBurrowHint: 'Proteja sua toca: conecte sua wallet.',
    chooseRabbit: 'Escolher meu coelho',
    saveBurrowTitle: 'Salvar minha toca',
    guestLabel: 'Convidado',
    accountLabel: 'Conta',
    walletShort: 'Wallet',
    harvests: 'Cenouras colhidas',
    raidsHeading: 'Ataques',
    purchasesHeading: 'Compras',
    noRuns: 'Nenhuma saída concluída ainda.',
    noRaids: 'Ninguém veio para cima de você ainda.',
    noPurchases: 'Nada da loja ainda.',
    today: 'Hoje',
    youHit: (name) => `Você acertou ${name}`,
    damage: (n) => `${n} de dano`,
    shovedIn: 'empurrado na água',
    struckDown: 'eletrocutado',
    youShoved: (name) => `Você empurrou ${name} na água`,
    youStruck: (name) => `Você eletrocutou ${name}`,
    spent: (n) => `-${n} 🥕`,
    usd: (n) => `US$ ${n}`,
    revenge: 'VINGAR AGORA',
    avenged: 'acertado',
    revengeShielded: 'Protegido',
  },

  avatars: {
    brown: 'Marrom',
    gray: 'Cinza',
    orange: 'Laranja',
    white: 'Branco',
    yellow: 'Amarelo',
  },

  codex: {
    title: 'A COROA AMALDIÇOADA',
    aria: 'História da coroa amaldiçoada',
    close: 'Fechar o códice',
    newChapter: 'CAPÍTULO NOVO',
    complete: 'COMPLETO',
    isNew: 'NOVO',
    sealed: (at, have) => `Selado até ${at} cenouras acumuladas. Você tem ${have}.`,
    nextIn: (n) => `Próximo capítulo em ${n} cenouras`,
    lifetimeOnly: 'Só cenouras acumuladas. Nada aqui pode ser saqueado.',
    done: 'O códice está completo. A ilha continua esperando.',
    carrotsAt: (n) => `${n} cenouras`,
    chapterN: (n) => `Capítulo ${n}`,
    chapters: 'Capítulos',
  },

  quest: {
    claim: 'RESGATAR',
    claimItem: (qty, kind) => `RESGATAR ${qty} ${kind.toUpperCase()}${qty > 1 ? 'S' : ''}`,
    claimCarrots: (n) => `RESGATAR ${n} 🥕`,
    aria: (reward, title) => `${reward} por ${title}`,
    progress: (progress, goal) => `${progress}/${goal}`,
    counter: (index, total) => `MISSÃO ${index} / ${total}`,
  },

  /* Les regles du jeu, sur la planche du pas-de-porte. Voir en.ts :
     ce sont des FAITS, pas de l'ambiance, et les chiffres sont ceux de
     config/tuning.ts. */
  doorstepTips: [
    'O NÚMERO NUM BLOCO CONTA AS BOMBAS QUE O TOCAM',
    'CAVAR CUSTA 1 DE ENERGIA - UMA BOMBA CUSTA {bomb}',
    'MARQUE UMA BOMBA COM UM X VERMELHO: CERTO DEVOLVE ENERGIA, ERRADO CUSTA 15',
    'ANDAR DE VOLTA POR BLOCOS JÁ CAVADOS É DE GRAÇA',
    'CADA BAÚ QUE VOCÊ ABRE VAI PARA CASA COM VOCÊ',
    'A ILHA É O RELÓGIO - CAVE TUDO E ELA AFUNDA',
    'AS CENOURAS SÃO A PONTUAÇÃO - SÓ UM X VERMELHO CERTO DEVOLVE ENERGIA',
  ],

  taglines: [
    'CADA PASSO PODE SER O ÚLTIMO... OU SUA FORTUNA',
    'ATRAVESSE A ILHA, PEGUE O OURO, OU MORRA TENTANDO',
    'OS BRAVOS VÃO MAIS LONGE - OS SORTUDOS VOLTAM',
    'PASSO A PASSO, A ILHA TIRA OU A ILHA DÁ',
    'SÓ OS OUSADOS SOBREVIVEM - SÓ OS SÁBIOS PARAM',
  ],

  islands: {
    Meadow: 'Campina',
    Thicket: 'Matagal',
    Ashland: 'Terra de Cinzas',
    Caldera: 'Caldeira',
  },

  items: {
    trap: {
      name: 'Bomba',
      blurb: 'Enterre uma na sua toca. Ela drena o saqueador que pisar nela.',
    },
    bomb: {
      name: 'Bomba oculta',
      blurb: 'Plante uma na ilha de alguém no meio da saída. A pessoa vê que foi você.',
    },
    lightning: {
      name: 'Raio',
      blurb: 'Eletrocuta um rival no meio da saída. O raio abre o chão em volta dele.',
    },
    shield: {
      name: 'Escudo',
      blurb: 'Saques ricocheteiam na sua toca enquanto ele durar.',
    },
    energy: {
      name: 'Energia',
      blurb: 'Um tanque cheio para guardar. Use quando ficar sem energia.',
    },
    smoke: {
      name: 'Cortina de fumaça',
      blurb: 'Esconde os números da sua toca por um dia. Saqueadores atravessam às cegas.',
    },
    bloop: {
      name: 'Bloop',
      blurb: 'Esguicha tinta nos olhos de um rival. Por alguns segundos ele não vê — nem sai.',
    },
    mirage: {
      name: 'Miragem',
      blurb: 'Faz alguns números de um rival mentirem no meio da saída. Dá para perceber.',
    },
    /* A única defesa FEITA para ser vista — "não atravessam" e não "atrasa":
       um saqueador que lê isso e contorna entendeu o item exatamente.
       Ver lib/game/fences.ts. */
    fence: {
      name: 'Cerca',
      blurb: 'Fecha uma borda da sua horta. Saqueadores não atravessam.',
    },
    shiro_stash: {
      name: 'Estoque do Shiro',
      blurb: 'Bombas, cercas e escudo para segurar a toca.',
    },
    kuro_tantrum: {
      name: 'Birra do Kuro',
      blurb: 'Raios e bloops para estragar a partida de um rival.',
    },
    refill_3: {
      name: '3 recargas',
      blurb: 'Três tanques cheios, guardados para depois.',
    },
    refill_10: {
      name: '10 recargas',
      blurb: 'Dez tanques cheios, guardados até você precisar.',
    },
  },

  quests: {
    'break-ground': {
      title: 'Abrir o chão',
      ask: (tiles) => `Cave ${tiles} quadrados.`,
      line: 'Cada quadrado cavado diz quantas bombas encostam nele. Exatamente. Os números são honestos.',
    },
    'come-home': {
      title: 'Voltar para casa',
      ask: () => 'Termine uma saída.',
      line: 'O que você carregava está na toca agora. Nada na ilha alcança isso.',
    },
    'bring-it-in': {
      title: 'Recolher tudo',
      ask: () => 'Colha a horta.',
      line: 'A horta cresce enquanto você está fora. O que um ladrão leva também.',
    },
    'bury-something': {
      title: 'Enterrar algo',
      ask: () => 'Vá em DEFENDER e enterre bombas na sua toca.',
      line: 'Uma bomba que ninguém vê é o único muro que vale. Muro a gente contorna.',
    },
    'open-a-chest': {
      title: 'Abrir um baú',
      ask: () => 'Desenterre um baú numa ilha.',
      line: 'Um baú é uma promessa. É também uma caminhada por um chão que você ainda não leu.',
    },
    'knock-on-a-door': {
      title: 'Bater numa porta',
      ask: () => 'Saqueie uma toca. Qualquer profundidade conta.',
      line: 'A única coisa que se pode tirar de um coelho é o que ele deixou para trás.'
        + ' Agora você esteve dos dois lados.',
    },
    'look-up': {
      title: 'Olhar para cima',
      ask: () => 'Abra o placar da temporada.',
      line: 'Alguém usa a coroa. Ela acende uma luz em todo mapa, e nunca se apaga.',
    },
    'read-the-stones': {
      title: 'Ler as pedras',
      ask: (numeral) => `Abra o capítulo ${numeral} do códice.`,
      line: 'A ilha não mata os azarados. Ela mata os apressados,'
        + ' e guarda um registro cuidadoso da diferença.',
    },
    'hold-the-door': {
      title: 'Segurar a porta',
      ask: (traps) => `Tenha ${traps} bombas no chão antes do seu escudo cair.`,
      line: 'Seu escudo cai logo. Depois disso, só resta o chão. Deixe-o caro.',
    },
    'the-thicket': {
      title: (island) => `O ${island}`,
      ask: (carrots) => `Alcance ${carrots} cenouras acumuladas.`,
      line: 'Chão mais rico, e mais coisa enterrada.'
        + ' A ilha chama isso de troca justa e não espera sua resposta.',
    },
  },

  lore: {
    'the-island': {
      title: 'A ilha que dá',
      teaser: 'Por que o chão é generoso.',
      body: [
        'Ninguém plantou a primeira cenoura. A ilha simplesmente foi encontrada, numa manhã, '
        + 'já cheia delas — fileiras de coroas laranja empurrando pela areia que a maré '
        + 'tinha acabado de deixar. Os coelhos que a acharam fizeram a coisa sensata. Cavaram.',

        'Ela nunca parou de dar. Cave um buraco e o chão oferece alguma coisa: uma cenoura, '
        + 'um baú, uma pedra com um número riscado nela. Os números são honestos. Sempre '
        + 'foram honestos. É justamente disso que os coelhos velhos avisam — uma coisa que '
        + 'nunca mente para você é uma coisa que quer alguma coisa, e ela tem paciência '
        + 'suficiente para esperar você perguntar o quê.',
      ],
    },
    'the-numbers': {
      title: 'O que os números sabem',
      teaser: 'O chão conta o que enterrou.',
      body: [
        'Um quadrado cavado diz quantas bombas encostam nele. Não por alto. Exatamente. '
        + 'Nenhum coelho jamais achou uma pedra que mentisse, e coelhos procuraram muito, '
        + 'em geral com uma pata a menos.',

        'Então o perigo nunca são os dados. O perigo é você, lendo rápido porque tem outro '
        + 'a três quadrados de distância indo atrás da mesma cenoura. A ilha não mata os '
        + 'azarados. Ela mata os apressados, e guarda um registro cuidadoso da diferença.',
      ],
    },
    'the-burrow': {
      title: 'A lei da toca',
      teaser: 'Nada é tirado de você enquanto você cava.',
      body: [
        'Lá na ilha você não pode perder. Pise numa bomba e você é arremessado, atordoado, '
        + 'sem ar — mas a sua pilha não é tocada. Toda cenoura que você já levou para casa '
        + 'continua em casa.',

        'E o problema é exatamente esse. Casa é onde está tudo, e casa é onde você não '
        + 'está, porque você está aqui, cavando. A ilha fez disso uma regra e achou muita '
        + 'graça: a única coisa que se pode tirar de um coelho é aquela que ele deixou '
        + 'para trás.',
      ],
    },
    'the-crown': {
      title: 'A coroa não é um prêmio',
      teaser: 'Ela marca você em todo mapa.',
      body: [
        'Quem segura a maior temporada acorda uma manhã com a coroa esperando na cabeça. '
        + 'Não dá para tirar, vender, enterrar nem dar de presente. Coelhos tentaram as '
        + 'quatro. Existe um capítulo sobre a quarta, e ele é curto.',

        'A coroa é generosa, e é assim que ela funciona. Ela deixa o chão mais rico sob '
        + 'quem a usa e os baús mais pesados. Ela também acende no mapa do mundo uma luz '
        + 'que todo outro coelho enxerga de qualquer lugar, e que nunca se apaga. A ilha '
        + 'não premia o primeiro coelho. Ela o ilumina, e então dá um passo atrás para ver '
        + 'o que os outros vão fazer a respeito.',
      ],
    },
    'the-tide': {
      title: 'Quando uma ilha já deu o bastante',
      teaser: 'O mar é quem conta.',
      body: [
        'Uma ilha flutua sobre o que está guardando. Cada baú é lastro, e o mar esteve '
        + 'esperando embaixo de todos eles o tempo todo. Pegue o último e a água sobe '
        + 'sobre o chão que você cavou — não há como negociar isso e não há como cobrir '
        + 'de novo o que foi aberto. Uma ilha é uma coisa que acontece uma vez. Ela dá '
        + 'até não sobrar nenhum baú, depois afunda sem muita cerimônia e os coelhos '
        + 'nadam.',

        'Os coelhos velhos não tratam isso como desastre. Tratam como uma conta sendo '
        + 'acertada. Alguma coisa foi tirada do mundo, em quantidade enorme, por coelhos a '
        + 'quem se disse a verdade exata sobre cada passo e que escolheram seguir em '
        + 'frente. A ilha simplesmente volta para a água, e outra emerge em algum lugar, '
        + 'já cheia de cenouras, já morna.',
      ],
    },
  },
};
