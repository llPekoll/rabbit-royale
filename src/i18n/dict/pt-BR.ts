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
    on: 'SIM',
    off: 'NÃO',
    settings: 'Ajustes de som',
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
    ariaDefend: (line) => `Defender: enterrar armadilhas. ${line}`,
    ariaRaid: (line) => `Saquear. ${line}`,
    energyOf: (energy, max) => `${energy}/${max} de energia`,
    runCosts: (n) => `a travessia custa ${n}`,
    runIn: (wait) => `saída em ${wait}`,
    aMoment: 'um instante',
    gardenPlus: (n) => `horta +${n}`,
    gardenEmpty: 'horta vazia',
    shieldFor: (wait) => `escudo ${wait}`,
    shieldBadge: (wait) => `Escudo ${wait}`,
    noShield: 'sem escudo',
    /* Zero é plural em português: "0 armadilhas". */
    traps: (n) => `${n} armadilha${n === 1 ? '' : 's'}`,
    leftOutside: (name, n) => `${name} deixou ${n} lá fora`,
    burrowsOpen: (n) => `${n} toca${n === 1 ? '' : 's'} abert${n === 1 ? 'a' : 'as'}`,
    bombsInBag: (n) => `${n} bomba${n === 1 ? '' : 's'} na bolsa`,
    allShielded: 'todas as tocas com escudo',
  },

  next: {
    label: 'AGORA',
    aria: (text) => `Agora: ${text}`,
    gardenFull: 'Horta quase cheia. Recolha antes que um saqueador recolha.',
    shieldLifts: (wait) => `Escudo cai em ${wait}. Enterre armadilhas.`,
    raidTarget: (name, garden) => `${name} deixou ${garden} na horta. Saqueie.`,
    dig: (energy) => `${energy} de energia: dá uma saída. Cave.`,
    digPlain: 'Cave.',
    runIn: (wait) => `Uma saída em ${wait}. A horta cresce enquanto isso.`,
  },

  burrow: {
    title: 'SUA TOCA',
    level: (n) => `TOCA - NÍV ${n}`,
    maxLevel: 'NÍVEL MÁXIMO',
    upgrade: 'CAVAR MAIS',
    safe: 'A SALVO',
    exposed: (n) => `${n} EXPOSTAS`,
    garden: 'HORTA',
    harvest: 'COLHER',
    energy: 'ENERGIA',
    gardenGrows: 'A HORTA CRESCE MAIS RÁPIDO',
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
    islandSilent: 'A ilha não respondeu. Tente de novo daqui a pouco.',
    runResumed: 'De volta à sua partida.',
    reconnecting: 'Reconectando... tente daqui a pouco.',
    harvested: (n) => `+${n} 🥕`,
    needMore: (n) => `Faltam ${n} 🥕`,
    questDone: (title) => `Missão concluída: ${title}`,
  },

  run: {
    goFarm: 'Limpar todas as minas',
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
    markHint: 'Toque na casa onde você acha que há uma bomba · certo: +energia · errado: -energia',
    markCancel: 'Cancelar',
    markNothing: 'Nada para marcar aqui: todas as casas ao seu redor já foram lidas.',
    energyLow: 'Energia baixa. Um X certo numa bomba devolve um pouco.',
    energyRaidLeft: 'Ainda dá para um saque. Volte agora, ou continue.',
    trapHint: (left) => `Toque num quadrado para minar, numa mina para tirar · restam ${left}`,
    trapHintEmpty: 'Sem bombas · compre outra, ou toque numa mina para tirar e enterrar noutro lugar',
    strike: 'Raio',
    aiming: 'Toque num rival para atingi-lo',
    strikeNone: 'Sem raio para chamar. O galpão vende.',
    plant: 'Plantar bomba',
    aimingPlant: 'Toque num chão não cavado para enterrar uma bomba',
    plantNone: 'Sem bombas para plantar. O galpão vende.',
    planted: 'Bomba enterrada. Só você sabe onde.',
    plantRefused: {
      'off-island': 'Fora da ilha.',
      revealed: 'Esse chão já foi cavado.',
      hinted: 'O tabuleiro já diz que essa casa é segura.',
      chest: 'Não embaixo de um baú.',
      'too-many': 'Três bombas ativas é o máximo aqui.',
    } as Record<string, string>,
    plantedBy: (name) => `Bomba de ${name}!`,
    struckBy: (name) => `${name} te atingiu com um raio`,
    watchers: (n) => `${n} online`,
    hitBolt: (name) => `${name} te fulminou`,
    hitBomb: (name) => `${name} minou isso`,
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
    cleared: 'ILHA LIMPA!',
    over: 'FIM DA SAÍDA',
    clearedNote: 'Todos os baús saíram do chão. O mar levou o resto.',
    overNote: 'Sem energia.',
    tutorialDone: 'VOCÊ PEGOU!',
    tutorialDoneNote: 'O baú era a ilha inteira. Suas cenouras esperam na toca.',
    stats: (carrots, dug, bombs, time) => `🥕 ${carrots} · ${dug} cavados · 💣 ${bombs} · ${time}`,
    bank: (energy, max, cost) => `⚡ ${energy}/${max} na toca · uma saída leva ${cost}`,
    raidLeft: (energy) => `⚡ ${energy} na toca: dá para um saque`,
    getEnergy: 'Pegar mais energia',
    goHome: 'Toca · empilhar',
    shoved: 'NA ÁGUA!',
    struck: 'FULMINADO!',
    shovedNote: (name) => `${name} te empurrou na água.`,
    struckNote: (name) => `${name} chamou o raio em cima de você.`,
    shovedNoteAnon: 'Alguém te empurrou na água.',
    struckNoteAnon: 'Alguém chamou o raio em cima de você.',
  },
  shove: {
    by: (name) => `${name} te empurrou!`,
    anon: 'Alguém te empurrou!',
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
    shed: 'O GALPÃO',
    aria: 'Loja',
    protect: 'PROTEGER A BASE',
    protectAria: 'Proteger sua base',
    protectBuyAria: 'Proteger sua base - comprar uma armadilha',
    noTraps: 'SEM ARMADILHAS - PEGUE UMA',
    nothingBuried: 'NADA ENTERRADO',
    inShed: (n) => `${n} NO GALPÃO`,
    rearming: (n) => `REARMANDO - ${n} VOLTANDO`,
    upAndRearming: (armed, rearming) => `${armed} DE PÉ - ${rearming} REARMANDO`,
    inGround: (armed, max) => `${armed}/${max} NO CHÃO`,
    openShed: 'Abrir o galpão',
    payWith: 'Pagar com',
    outOfEnergy: 'SEM ENERGIA',
    energySay: (cost, wait) =>
      `Uma saída leva ${cost}. Isso volta sozinho em ${wait}.`
      + ' Ou encha agora e continue cavando.',
    energySayEmpty: (wait) =>
      `A barra está vazia. Um ponto volta sozinho em ${wait}.`
      + ' Ou encha agora e continue cavando.',
    fillsTo: (max) => `Enche a barra até ${max}.`,
    noRefills: ' Sem recargas hoje.',
    refillsLeft: (n) => ` ${n} recarga${n > 1 ? 's' : ''} hoje.`,
    cardsOff: 'Pagamento com cartão ainda não está ligado. Só cenouras por enquanto.',
    connectForCard: 'Conecte uma carteira para pagar com cartão. Tudo aqui também se cava.',
    eitherWay: 'Cenouras que você cava, ou cartão. A mercadoria é a mesma.',
    pricing: 'Calculando preço...',
    approve: 'Aprove na sua carteira...',
    confirming: 'Confirmando na rede...',
    priceLabel: (price) => `${price} cenouras`,
    buy: (name, price) => `Comprar ${name} por ${price}`,
    capped: (name, price) => `${name}: ${price}. Você já carrega o máximo.`,
    tooPoor: (name, price) => `${name}: ${price}. Cenouras insuficientes. Vá cavar.`,
    heldOf: (held, cap) => `${held}/${cap}`,
    heldToday: (n) => `${n} hoje`,
    heldDaysLeft: (n) => `${n}d restantes`,
    heldOff: 'desligado',
    boughtEnergy: (paid) => `Energia recarregada. ${paid}`,
    boughtTrap: (n, paid) => `${n > 1 ? `${n} armadilhas` : 'Armadilha'} no galpão. ${paid}`,
    boughtBomb: (n, paid) => `${n > 1 ? `${n} bombas armadas` : 'Bomba armada'}. ${paid}`,
    boughtLightning: (n, paid) => `${n > 1 ? `${n} raios` : 'Raio'} engarrafado${n > 1 ? 's' : ''}. ${paid}`,
    boughtShield: (n, paid) => `${n > 1 ? `${n} escudos prontos` : 'Escudo pronto'}. ${paid}`,
    boughtSmoke: (paid) => `Os números estão escondidos. ${paid}`,
    boughtMirage: (n, paid) => `${n > 1 ? `${n} miragens prontas` : 'Miragem pronta'} para jogar. ${paid}`,
    /* Uma cerca é LEVANTADA: o que se compra é uma tábua que fecha um trecho da
       borda da horta, então o recibo nomeia aquilo em que ela se transforma. */
    boughtFence: (n, paid) => `${n > 1 ? `${n} tábuas prontas` : 'Tábua pronta'} para levantar. ${paid}`,
    paid: (spent) => `-${spent} 🥕`,
  },

  shopErrors: {
    fallback: 'Não deu certo.',
    insufficient_carrots: 'Cenouras insuficientes.',
    inventory_full: 'Sua bolsa está cheia desses.',
    daily_energy_limit: 'Sem mais recargas hoje. A horta continua crescendo.',
    smoke_capped: 'Sua toca está escondida pelo máximo de tempo possível.',
    too_many_at_once: 'Demais de uma vez.',
    bad_quantity: 'Isso não é uma quantidade.',
    no_traps: 'Sem armadilhas. Compre uma, ou espere amanhã.',
    board_full: 'Sua toca não cabe mais uma armadilha.',
    tile_not_trappable: 'Nada para minar aí.',
    tile_doorstep: 'Perto demais da porta. Os primeiros passos ficam livres.',
    tile_already_trapped: 'Já minado.',
    no_trap_there: 'Não tem armadilha aí.',
    no_fences: 'Sem cercas. O galpão vende.',
    span_already_fenced: 'Já tem uma tábua aí.',
    span_not_exposed: 'Isso não é uma borda da sua horta.',
    /* A regra do portão, dita como regra e não como erro: é a única recusa
       daqui que o jogador precisa APRENDER, então ela diz por que antes de
       dizer não. */
    would_seal_burrow: 'Isso fecharia a última entrada. Uma entrada fica aberta como portão.',
    span_not_fenced: 'Não tem tábua aí.',
    bad_span: 'Isso não é lugar para uma tábua.',
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
  },

  pay: {
    needsBuild: 'Pagar pelo app depende da próxima versão. Compre com cenouras por ora.',
    noWallet: 'Nenhuma carteira Solana encontrada. Instale a Phantom para pagar com USDC.',
    notConfigured: 'Pagamentos não estão configurados neste servidor.',
    stillConfirming: 'Pago, mas ainda confirmando. Reabra a loja em um minuto. Nada se perde.',
    failed: 'Pagamento falhou',
  },

  kit: {
    tools: {
      more: 'Ver efeito e ações', less: 'Recolher detalhes',
      available: (n) => n + ' disponíveis',
      placed: (n) => n + ' colocados',
      active: (time) => time + ' restantes',
      buyTrap: (price) => 'Comprar armadilha - ' + price + ' cenouras',
      trapHint: 'Toque numa casa para enterrar. Toque na armadilha para recuperar.',
      trapEmpty: 'Recupere uma armadilha ou compre uma abaixo.',
      fenceHint: 'Toque numa borda iluminada para construir. Toque na cerca para recuperar.',
      raiseShield: 'Usar um escudo', shieldActive: 'Sua toca já está protegida.',
      shopHint: 'Disponível na loja.', notEnough: 'Faltam cenouras para outra armadilha.',
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
      `Armadilhas: ${placed}${max ? ` de ${max}` : ''} no chão, ${held} no galpão.`
      + ' Enterre pela BASE.',
    trapsBuy: (held, price) =>
      (held > 0
        ? `Armadilhas: ${held} no galpão. Compre outra por ${price} cenouras.`
        : `Armadilhas: galpão vazio. Compre uma por ${price} cenouras.`),
    trapsBuyBroke: (price) =>
      `Armadilhas: nenhuma. Uma custa ${price} cenouras - va cavar mais.`,
    trapsBuyFull: (held) => `Armadilhas: ${held} no galpão. O galpão está cheio.`,
    bottleRunning: (name, wait, count) => `${name}: em curso, restam ${wait}. ${count} na bolsa.`,
    bottleHeld: (name, count) => `${name}: ${count} na bolsa. Despeje uma na horta.`,
    bottleNone: (name) => `${name}: nenhuma. Encontradas em baús.`,
    /* A CASA DA CERCA. Uma cerca é uma tábua sobre um trecho da borda da horta.
       `total` são todos os trechos, portão incluído, como quem chama
       (kit-row.tsx) os conta: o último nunca pode ser fechado, e fenceAllWalled
       diz isso em vez de deixar a conta ler como uma tábua que o jogador deixou
       de levantar. */
    fencePlace: (held, walled, total) =>
      `Cercas: ${held} tábua${held === 1 ? '' : 's'} na bolsa, ${walled} de ${total} trecho${total === 1 ? '' : 's'} fechado${walled === 1 ? '' : 's'}.`
      + ' Levante uma.',
    /* Não é falha, por isso o portão é dito na cara: o jogador fez tudo o que o
       item permite, e um "não dá mais" leria como um limite a ser vencido. */
    fenceAllWalled: (walled) =>
      `Cercas: ${walled} trecho${walled === 1 ? '' : 's'} fechado${walled === 1 ? '' : 's'}.`
      + ' A última entrada é o portão e fica aberta.',
    /* Nomeia o caminho de volta a uma tábua quando a bolsa está vazia: uma tábua
       levantada não foi gasta, é só tocar nela para pegá-la de volta. */
    fenceNone: (walled) =>
      `Cercas: nenhuma na bolsa, ${walled} trecho${walled === 1 ? '' : 's'} fechado${walled === 1 ? '' : 's'}.`
      + ' O galpão vende. Toque numa tábua levantada para pegá-la de volta.',
    watering: 'Rega',
    fertiliser: 'Adubo',
  },

  raid: {
    go: 'IR SAQUEAR',
    another: 'Saquear outra toca',
    choose: 'Escolha uma toca',
    whose: 'TOCA DE QUEM?',
    allShielded: 'TODAS AS TOCAS COM ESCUDO',
    nobody: 'NINGUÉM PARA ROUBAR',
    shielded: 'Com escudo',
    presence: {
      away: 'ausente',
      home: 'na toca',
      digging: 'cavando fora',
    },
    raidIt: 'Saquear',
    brief: 'Alcance a plantação de cenouras. As armadilhas deles estão enterradas e sem marca.',
    outOfEnergy: 'Sem energia',
    nothingTaken: 'Nada levado',
    unguarded: (amount) => `${amount} SEM GUARDA`,
    nobodyYet: 'Ninguém mais tem uma toca ainda.',
    steps: 'passos',
    stepsBack: (n) => `Campo alcançado: seus ${n} passos voltam`,
    looted: (n) => `+${n} 🥕`,
    won: 'SAQUE VENCIDO!',
    backToBurrow: 'DE VOLTA À TOCA',
    aRival: 'UM RIVAL',
    lootedFrom: (name) => `SAQUEADO DE ${name}`,
    wasEmpty: (name) => `A TOCA DE ${name} ESTAVA VAZIA`,
    trapsSprung: (n) =>
      n === 1 ? '1 ARMADILHA DISPARADA NA ENTRADA' : `${n} ARMADILHAS DISPARADAS NA ENTRADA`,
    wonAria: (carrots, name) => `Saque vencido - ${carrots} cenouras levadas de ${name}`,
    rabbitAria: 'Seu coelho, comemorando',
    stolen: (n, name) => `+${n} 🥕 roubadas de ${name}`,
    fellShort: (pct, name) => `Caiu a ${pct}% do caminho até a horta de ${name}`,
    defended: 'DEFENDIDA',
    raided: 'SAQUEADA',
    byWho: (who, n) => `POR ${who} · -${n} CENOURAS`,
    byWhoNothing: (who) => `POR ${who}`,
    bounced: (n) => `${n} SAQUE${n === 1 ? '' : 'S'} RICOCHETEARAM`,
    struck: 'Atingido por um raio',
    struckBy: (name) => `${name} chamou um raio em cima de você`,
  },

  /* ── Sua toca sob ataque, vista de casa ──────────────────────────────── */
  defend: {
    underAttack: (name) => `${name.toUpperCase()} ESTÁ SAQUEANDO VOCÊ`,
    theirSteps: 'passos dele',
    hint: 'Enterre uma bomba na frente dele, ou toque no coelho para chamar um raio.',
    strike: 'Raio',
    held: (n) => (n === 1 ? '1 na bolsa' : `${n} na bolsa`),
    struckDown: 'DERRUBADO',
    ranDry: 'FICOU SEM ENERGIA',
    looted: (n) => `LEVARAM ${n} 🥕`,
    lost: 'Sua toca foi saqueada',
    held_: 'Toca defendida',
    incoming: (name) => `${name} está saqueando sua toca!`,
  },

  raidErrors: {
    fallback: 'Não deu certo.',
    target_shielded: 'A toca deles está com escudo. Tente outra pessoa.',
    cannot_raid_yourself: 'Essa é a sua própria toca.',
    raid_in_progress: 'Você já está dentro de uma toca.',
    cooldown: 'Você saqueou essa pessoa faz pouco tempo.',
    no_energy: 'Energia insuficiente para a travessia. Espere, ou recarregue.',
    not_adjacent: 'Longe demais. Um passo por vez.',
    raid_over: 'Esse saque já acabou.',
    none_held: 'Sem raio para chamar. O galpão vende.',
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
    loading: 'Carregando...',
    now: 'agora',
    historyFailed: 'Não foi possível carregar seu histórico.',
    noRuns: 'Nenhuma saída concluída ainda.',
    noRaids: 'Ninguém veio para cima de você ainda.',
    noPurchases: 'Nada do galpão ainda.',
    today: 'Hoje',
    youHit: (name) => `Você acertou ${name}`,
    damage: (n) => `${n} de dano`,
    shovedIn: 'empurrado na água',
    struckDown: 'fulminado por um raio',
    youShoved: (name) => `Você empurrou ${name} na água`,
    youStruck: (name) => `Você fulminou ${name}`,
    spent: (n) => `-${n} 🥕`,
    usd: (n) => `US$ ${n}`,
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
      name: 'Armadilha',
      blurb: 'Enterre uma na sua toca. Ela drena o saqueador que pisar nela.',
    },
    bomb: {
      name: 'Bomba',
      blurb: 'Plante uma na ilha de alguém no meio da saída. A pessoa vê que foi você.',
    },
    lightning: {
      name: 'Raio',
      blurb: 'Chama um raio na ilha de um rival. Ele abre o chão em volta.',
    },
    shield: {
      name: 'Escudo',
      blurb: 'Saques ricocheteiam na sua toca enquanto ele durar.',
    },
    energy: {
      name: 'Energia',
      blurb: 'Encha a barra e cave agora, em vez de esperar.',
    },
    smoke: {
      name: 'Cortina de fumaça',
      blurb: 'Esconde os números da sua toca por um dia. Saqueadores atravessam às cegas.',
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
      blurb: 'Fecha um trecho da borda da sua horta. Saqueadores não atravessam.',
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
      ask: () => 'Ponha uma armadilha no seu chão.',
      line: 'Uma armadilha que ninguém vê é o único muro que vale. Muro a gente contorna.',
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
      ask: (traps) => `Tenha ${traps} armadilhas no chão antes do seu escudo cair.`,
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
