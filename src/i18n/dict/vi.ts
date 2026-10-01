/**
 * TIẾNG VIỆT.
 *
 * PAS DE CAPITALES PARTOUT, comme en français : le vietnamien tombe sur une
 * face qui a des minuscules et tous les diacritiques, donc les étiquettes
 * s'écrivent normalement. Les mots qui restent en capitales sont ceux que
 * fr.ts garde aussi en capitales — les trois verbes du sol, les titres de
 * panneau, les cris de fin de partie — par choix de ton.
 *
 * LE TON. Registre familier et constant : « bạn » pour le joueur, jamais de
 * formule de politesse (pas de « vui lòng », pas de « quý khách »). L'île
 * parle sec, constate, ne s'excuse pas. Les répliques courtes restent courtes :
 * le vietnamien est souvent plus long que l'anglais à cause des mots
 * composés, alors on coupe les pronoms quand la phrase se comprend sans.
 *
 * PAS DE PLURIEL. Le vietnamien n'accorde pas les noms en nombre, donc les
 * fonctions qui en ont un en anglais rendent ici une seule forme.
 *
 * LE LEXIQUE, tenu partout : hang = burrow, vườn = garden, cướp = raid,
 * rương = chest, bẫy = trap, khiên = shield, sét = lightning, kho = shed,
 * hàng rào / tấm ván = fence / plank, chuyến = run, năng lượng = energy.
 */
import type { Dict } from '../dictionaries';

export const vi: Dict = {
  units: { s: 's', m: 'p', h: 'h', d: 'ng' },

  meta: {
    title: 'Rabbit Royale: Vương miện bị nguyền',
    description: 'Dò mìn đối kháng. Đào, tích trữ, đi cướp, đội vương miện.',
  },
  lang: { label: 'Ngôn ngữ' },
  consent: {
    title: 'Trước khi đào',
    body: 'Cho phép đo cách bạn chơi? Màn hình, lượt chạm và quảng cáo đưa bạn đến đây. Nhờ vậy biết cần sửa gì. Không bán dữ liệu.',
    crash: 'Báo cáo sự cố luôn được gửi: chỉ để sửa lỗi.',
    later: 'Đổi ý bất cứ lúc nào trong hồ sơ.',
    isOn: 'Hiện tại: đã đồng ý.',
    isOff: 'Hiện tại: đã từ chối.',
    policy: 'Chính sách quyền riêng tư',
    accept: 'Đồng ý',
    refuse: 'Từ chối',
    settings: 'Quyền riêng tư',
  },

  auth: {
    connect: 'Kết nối ví',
    connecting: 'Đang đào...',
    guest: 'Chơi với tư cách khách',
    waiting: 'Đang chờ...',
    guestNote: 'Hang của khách. Kết nối ví để giữ nó lại.',
    noWallet: 'Không tìm thấy ví. Mở trong app Rabbit Royale hoặc cài một ví Solana.',
    signInFailed: 'Đăng nhập thất bại',
    guestFailed: 'Không mở được hang khách',
    walletTaken: 'Ví này đã có hang rồi.',
    walletDigsFor: (name) => `Ví này đã đào cho « ${name} ».`,
    alreadyLinked: 'Hang này đã có ví rồi.',
    linkFailed: 'Không kết nối được ví này',
  },

  chrome: {
    loading: 'Đang tải',
    waking: 'Đang đánh thức bầy thỏ',
    reconnecting: 'Đang kết nối lại...',
    back: 'Quay lại',
    close: 'Đóng',
    shop: 'Cửa hàng',
    story: 'Cốt truyện',
    season: 'MÙA',
    logoAlt: 'Rabbit Royale',
    rotateTitle: 'Xoay ngang điện thoại',
    rotateBody: 'Rabbit Royale chơi ở màn hình ngang.',
  },

  install: {
    title: {
      ios: 'Màn hình chính',
      macSafari: 'Thêm vào Dock',
      chromiumDesktop: 'Cài ứng dụng',
      androidChromium: 'Màn hình chính',
    },
    line: {
      ios: 'Toàn màn hình, không thanh trình duyệt, chạm một cái từ Màn hình chính.',
      macSafari: 'Rabbit Royale trong cửa sổ riêng, mở thẳng từ Dock.',
      chromiumDesktop: 'Rabbit Royale trong cửa sổ riêng, một cú nhấp từ dock.',
      androidChromium: 'Toàn màn hình, không thanh trình duyệt, chạm một cái từ màn hình chính.',
    },
    steps: {
      ios: [
        'Chạm nút Chia sẻ (trong Safari ở thanh dưới cùng, trong Chrome ở thanh địa chỉ).',
        'Cuộn xuống và chạm Thêm vào MH chính.',
        'Chạm Thêm. Rabbit Royale mở toàn màn hình từ Màn hình chính.',
      ],
      macSafari: [
        'Trên thanh menu, chọn Tệp > Thêm vào Dock (hoặc Chia sẻ > Thêm vào Dock).',
        'Nhấp Thêm. Rabbit Royale mở trong cửa sổ riêng từ Dock.',
        'Cần Safari 17 trở lên.',
      ],
      prompt: ['Nhấn Cài đặt bên dưới rồi xác nhận trong hộp thoại của trình duyệt.'],
      chromiumDesktop: [
        'Nhấp biểu tượng cài đặt ở cuối thanh địa chỉ, hoặc mở menu trình duyệt > Truyền, lưu và chia sẻ > Cài đặt trang dưới dạng ứng dụng.',
        'Xác nhận bằng Cài đặt.',
        'Đã cài rồi? Khi đó biểu tượng ghi Mở trong ứng dụng.',
      ],
      androidChromium: [
        'Mở menu trình duyệt (ba dấu chấm) và chạm Thêm vào màn hình chính.',
        'Chạm Cài đặt. Rabbit Royale mở toàn màn hình từ màn hình chính.',
      ],
    },
    install: 'Cài đặt',
    installing: 'Đang cài...',
    showMe: 'Chỉ cho tôi',
    gotIt: 'Hiểu rồi',
    close: 'Đóng',
    app: 'App',
  },

  sound: {
    group: 'Âm thanh',
    music: 'Nhạc',
    effects: 'Hiệu ứng',
    volume: 'Âm lượng',
    on: 'BẬT',
    off: 'TẮT',
    settings: 'Cài đặt âm thanh',
    mute: 'Tắt nhạc',
    unmute: 'Bật lại nhạc',
    musicOn: 'Nhạc đang bật',
    musicOff: 'Nhạc đang tắt',
  },

  loop: {
    dig: 'ĐÀO',
    defend: 'PHÒNG THỦ',
    raid: 'CƯỚP',
    broughtHome: 'đã mang về',
    ariaGroup: 'Đào, hang, cướp',
    ariaDig: (line) => `Đào. ${line}`,
    ariaDefend: (line) => `Phòng thủ: chôn bẫy. ${line}`,
    ariaRaid: (line) => `Cướp. ${line}`,
    energyOf: (energy, max) => `${energy}/${max} năng lượng`,
    runCosts: (n) => `qua biển tốn ${n}`,
    runIn: (wait) => `ra khơi sau ${wait}`,
    raidNeeds: (floor, have, wait) => `Đi cướp cần ${floor} năng lượng. Đang có ${have}, đủ sau ${wait}.`,
    raidIn: (wait) => `cướp sau ${wait}`,
    aMoment: 'một lát',
    gardenPlus: (n) => `vườn +${n}`,
    gardenEmpty: 'vườn trống',
    shieldFor: (wait) => `khiên ${wait}`,
    shieldBadge: (wait) => `Khiên ${wait}`,
    noShield: 'không có khiên',
    /* Pas de pluriel en vietnamien : une seule forme. */
    traps: (n) => `${n} bẫy`,
    leftOutside: (name, n) => `${name} để ${n} bên ngoài`,
    burrowsOpen: (n) => `${n} hang đang mở`,
    bombsInBag: (n) => `${n} bom trong túi`,
    allShielded: 'mọi hang đều có khiên',
  },

  next: {
    label: 'TIẾP',
    aria: (text) => `Tiếp: ${text}`,
    gardenFull: 'Vườn sắp đầy. Thu hoạch trước khi kẻ cướp tới.',
    shieldLifts: (wait) => `Khiên hạ sau ${wait}. Chôn bẫy đi.`,
    raidTarget: (name, garden) => `${name} để ${garden} trong vườn. Cướp.`,
    dig: (energy) => `${energy} năng lượng: đủ một chuyến. Đào.`,
    digPlain: 'Đào.',
    runIn: (wait) => `Một chuyến sau ${wait}. Vườn vẫn lớn trong lúc chờ.`,
  },

  burrow: {
    title: 'HANG CỦA BẠN',
    level: (n) => `HANG CẤP ${n}`,
    maxLevel: 'CẤP TỐI ĐA',
    upgrade: 'NÂNG CẤP',
    safe: 'AN TOÀN',
    exposed: (n) => `${n} BỊ LỘ`,
    garden: 'VƯỜN',
    harvest: 'THU HOẠCH',
    energy: 'NĂNG LƯỢNG',
    gardenGrows: 'VƯỜN LỚN NHANH HƠN',
    gardenAtRisk: (perHour) => `bị cướp được tới khi thu · ${perHour}/giờ`,
    gardenGrowing: (perHour, holds) => `lớn trong lúc bạn đào · ${perHour}/giờ · chứa ${holds}`,
    yieldRate: (perHour) => `${perHour} cà rốt/giờ`,
    regenRate: (perHour) => `${perHour} năng lượng/giờ`,
  },

  arrange: {
    tip: 'Chạm vào cây, nhà hoặc vườn để dời nó đi.',
    place: 'Chạm một ô trống để đặt vào đó.',
    placeTouch: 'Chạm một ô trống, hoặc kéo ngón tay tới đó rồi nhấc lên.',
    placed: 'Đã đặt và lưu.',
    undo: 'Hoàn tác',
    putBack: 'Trả về chỗ cũ',
    things: {
      tree: 'Cây', stump: 'Gốc cây', rock: 'Đá', bush: 'Bụi cây',
      house: 'Nhà của bạn', field: 'Vườn của bạn', thing: 'Đồ trang trí',
      mushroom: 'Nấm', pebble: 'Sỏi', grass: 'Búi cỏ', pumpkin: 'Bí ngô',
      bone: 'Xương', skullSign: 'Biển đầu lâu', signpost: 'Cột chỉ đường', scarecrow: 'Bù nhìn',
    },
    planksBack: (n) => `${n} hàng rào đã về lại túi`,
    bombsBack: (n) => `${n} bom đã về lại túi`,
    unsaved: 'Không lưu được hang. Thử lại sau một lát.',
    refused: {
      entrance: 'Đây là lối vào hang: kẻ cướp đi vào từ đó.',
      occupied: 'Chỗ này đã có thứ khác.',
      cells_overlap: 'Chỗ này đã có thứ khác.',
      field_off_ground: 'Vườn phải nằm trên đất liền.',
      field_split: 'Vườn phải nằm trên cùng một tầng.',
      thing_off_ground: 'Không đặt dưới nước.',
      field_unreachable: 'Thế là rào kín vườn. Kẻ cướp phải tới được đó.',
      crossing_too_short: (n) => `Quá gần lối vào: kẻ cướp cần ít nhất ${n} bước.`,
      crossing_too_long: (n) => `Quá xa: vườn phải cách tối đa ${n} bước.`,
      house_off_ground: 'Nhà cần một khoảng đất trống.',
      under_raid: 'Hang đang bị cướp. Xong rồi hẵng sắp xếp lại.',
      bad_edits: 'Cách sắp xếp này bị từ chối.',
    },
  },

  notes: {
    shieldUp: 'Khiên đã dựng. Kẻ cướp bật ra.',
    watered: 'Đã tưới. Vườn đầy nhanh hơn.',
    fed: 'Đã bón. Vườn chứa được nhiều hơn.',
    gardenEmpty: 'Vườn trống trơn. Quay lại sau.',
    maxDepth: 'Hang của bạn đã sâu hết mức.',
    shieldAlready: 'Khiên đang dựng rồi.',
    noneLeft: 'Hết rồi. Rương có rơi ra.',
    toppedUp: 'Đã đầy rồi. Để dành sau.',
    islandSilent: 'Đảo không trả lời. Thử lại sau một lát.',
    runResumed: 'Quay lại chuyến của bạn.',
    reconnecting: 'Đang kết nối lại... thử lại sau một lát.',
    harvested: (n) => `+${n} 🥕`,
    needMore: (n) => `Còn thiếu ${n} 🥕`,
    questDone: (title) => `Xong nhiệm vụ: ${title}`,
  },

  run: {
    goFarm: 'Dọn sạch mìn',
    findMe: 'Tìm thỏ của tôi',
    retreat: 'Rút lui',
    home: 'Về hang',
    stopWatching: 'Thôi xem',
    theirRun: 'chuyến của họ',
    chests: (taken: number, total: number) => `${taken}/${total} rương`,
    chestsTitle: 'Số rương đã lấy trên đảo này — của mọi người. Lấy hết thì đảo chìm.',
    watching: (label) => `👁 đang xem ${label}`,
    /** The run's energy bar, read aloud. */
    energy: (n, max) => `${n} trên ${max} năng lượng`,
    /** The red X — see FLAG in tuning. */
    markBomb: 'Đánh dấu bom',
    markHint: 'Chạm ô bạn nghĩ có bom · đúng: +năng lượng · sai: -năng lượng',
    markCancel: 'Hủy',
    markNothing: 'Không có gì để đánh dấu: mọi ô quanh bạn đã được đọc.',
    energyLow: 'Năng lượng thấp. Một dấu X đúng trên bom sẽ hoàn lại.',
    energyRaidLeft: 'Vẫn đủ đi cướp. Về hang, hoặc đào tiếp.',
    homeRaid: 'Về và đi cướp',
    crossed: (cost, energy) => `⚡ -${cost} để qua · còn ${energy}`,
    trapHint: (left) => `Chạm ô để gài mìn, chạm mìn để gỡ · còn ${left}`,
    trapHintEmpty: 'Hết bom · mua thêm, hoặc chạm một mìn để gỡ và chôn chỗ khác',
    strike: 'Giáng sét',
    aiming: 'Chạm một đối thủ để giáng sét',
    strikeNone: 'Không có sét để gọi. Kho có bán.',
    plant: 'Đặt bom',
    aimingPlant: 'Chạm ô chưa đào để chôn bom',
    plantNone: 'Không có bom để đặt. Kho có bán.',
    planted: 'Đã chôn bom. Chỉ bạn biết chỗ.',
    plantRefused: {
      'off-island': 'Không nằm trên đảo.',
      revealed: 'Ô đó đã đào rồi.',
      hinted: 'Bàn đã cho biết ô đó an toàn.',
      chest: 'Không đặt dưới rương.',
      'too-many': 'Tối đa ba bom cùng lúc ở đây.',
    } as Record<string, string>,
    plantedBy: (name) => `Bom của ${name}!`,
    struckBy: (name) => `${name} giáng sét vào bạn`,
    watchers: (n) => `${n} online`,
    hitBolt: (name) => `${name} giật sét bạn`,
    hitBomb: (name) => `Bom ngầm của ${name}`,
    bloop: 'Bloop',
    aimingBloop: 'Chạm một đối thủ để phun mực',
    bloopNone: 'Không có bloop để ném. Kho có bán.',
    bloopRefused: {
      'no-rival': 'Không có ai để phun mực.',
      level_locked: 'Chưa được trước cấp 3.',
      'none-held': 'Hết bloop.',
    } as Record<string, string>,
    hitBloop: (name) => `${name} phun mực vào bạn`,
    buyArms: 'Mua',
    inkedStay: (s) => `Mực đầy mắt · về sau ${s}s`,
  },

  firstRun: {
    tap: 'Chạm một ô cạnh bạn để đào.',
    numbers: 'Con số đếm số bom chạm vào ô đó.',
    counts: 'Số 1 này nghĩa là: có một quả bom trốn ở các ô xung quanh.',
    prove: 'Chỉ còn một ô chưa mở. Đó là bom.',
    mark: 'Nhấn ĐÁNH DẤU BOM, rồi chạm ô có dấu X đỏ.',
    aim: 'Giờ chạm vào ô đang nhấp nháy.',
    marked: 'Đúng! X đúng hoàn năng lượng. X sai thì mất.',
    fetch: 'Giờ đi lấy rương. Bên trong có gì cũng theo bạn về.',
    bomb: 'Mất năng lượng rồi. Số 1 đã chỉ vào nó.',
    golden: 'Vàng! Một củ cà rốt vàng bằng năm củ.',
    chest: 'Một cái rương. Bên trong có gì cũng theo bạn về.',
    clock: 'Hòn đảo là đồng hồ. Đào sạch là nó chìm.',
    recap: 'Cà rốt của bạn đã về hang. Đi xem đi.',
  },

  recap: {
    record: (island, n, previous) => previous ? `KỶ LỤC MỚI ở ${island}: ${n} 🥕 (trước: ${previous})` : `KỶ LỤC ĐẦU TIÊN ở ${island}: ${n} 🥕`,
    cleared: 'ĐẢO ĐÃ SẠCH!',
    over: 'HẾT CHUYẾN',
    clearedNote: 'Mọi rương đã lên khỏi đất. Biển lấy phần còn lại.',
    overNote: 'Hết năng lượng.',
    tutorialDone: 'BẠN LÀM ĐƯỢC RỒI!',
    tutorialDoneNote: 'Cái rương là cả hòn đảo. Cà rốt đang chờ bạn ở hang.',
    stats: (carrots, dug, bombs, time) => `🥕 ${carrots} · ${dug} ô đã đào · 💣 ${bombs} · ${time}`,
    bank: (energy, max, cost) => `⚡ ${energy}/${max} trong bình · qua biển tốn ${cost}`,
    raidLeft: (energy) => `⚡ còn ${energy} trong bình: đủ đi cướp`,
    getEnergy: 'Lấy thêm năng lượng',
    goHome: 'Về hang · cất đi',
    shoved: 'RƠI XUỐNG NƯỚC!',
    struck: 'BỊ SÉT ĐÁNH!',
    shovedNote: (name) => `${name} đẩy bạn xuống nước.`,
    struckNote: (name) => `${name} gọi sét giáng xuống bạn.`,
    shovedNoteAnon: 'Có ai đó đẩy bạn xuống nước.',
    struckNoteAnon: 'Có ai đó gọi sét giáng xuống bạn.',
  },
  shove: {
    by: (name) => `${name} đẩy bạn!`,
    anon: 'Có ai đó đẩy bạn!',
  },

  revenge: {
    struck: (name) => `${name} giật điện bạn!`,
    inked: (name) => `${name} phun mực vào bạn!`,
    strike: 'Đánh trả',
  },

  pass: {
    title: 'Vé Cà Rốt Vàng',
    show: 'Vé Cà Rốt Vàng',
    buy: 'Mua',
    soon: 'Sắp ra mắt',
    soonTag: 'SẮP CÓ',
    chestReady: 'Rương sẵn sàng!',
    short: 'Vé Vàng',
    left: (n) => `Còn ${n} ngày`,
    days: (n) => `${n} ngày`,
    daily: 'Rương mỗi ngày',
    dailyWhat: (bombs, bloops) => `Đầy năng lượng, bom ×${bombs}, bloop ×${bloops}`,
    race: 'Cuộc đua giành quỹ thưởng',
    raceWhat: (share, n) => `${n} người có vé đứng đầu chia nhau ${share} quỹ`,
    tag: 'Nhãn PASS vàng',
    tagWhat: 'Cạnh tên bạn trên bảng xếp hạng',
    pool: 'Quỹ thưởng',
    poolLine: (share, pot, holders) => `${share} của ${pot} · ${holders} người có vé`,
    active: 'Vé đang hoạt động',
    claim: 'Mở rương hôm nay',
    next: (time) => `Rương tiếp theo sau ${time}`,
    claimed: 'Đã mở rương: đầy năng lượng, một quả bom và một bloop!',
    bought: 'Vé đã kích hoạt! Chúc may mắn trong cuộc đua.',
    you: (rank, prize) => `Bạn: #${rank} · ${prize}`,
    unranked: 'Ghi điểm mùa này để vào cuộc đua',
    empty: 'Chưa ai có vé ghi điểm. Hãy là người đầu tiên!',
    closed: 'Hiện không bán vé',
    connect: 'Kết nối ví để mua vé',
    ending: 'Đã ngừng bán: mùa giải kết thúc trong vòng một giờ',
    owned: 'Bạn đã có vé mùa này',
    failed: 'Không mở được rương',
    terms: 'Tiền thưởng được trả bằng USDC vào ví của bạn khi mùa giải kết thúc.',
  },

  pill: {
    banked: (n) => `${n} cà rốt đã cất`,
    carryNote: 'Mang theo chuyến này: cất khi bạn về hang',
    carrying: (n) => `${n} cà rốt đang mang, chưa cất`,
    leading: 'dẫn đầu',
    rankFirst: 'Hạng mùa #1: dẫn đầu bảng',
    rank: (rank, gap) => `Hạng mùa #${rank}: cần ${gap} điểm để vượt #${rank - 1}`,
    toPass: (gap, rank) => `${gap} tới #${rank - 1}`,
    showClimb: (n, rank) => `${n} cà rốt đã cất, hạng mùa ${rank}. Xem cần gì để leo hạng`,
    hideClimb: (n, rank) => `${n} cà rốt đã cất, hạng mùa ${rank}. Ẩn cần gì để leo hạng`,
  },

  board: {
    show: 'Hiện bảng xếp hạng mùa',
    hide: 'Ẩn bảng xếp hạng mùa',
    diggingNow: 'đang đào · chạm để xem',
    watch: (name) => `Xem ${name} đào`,
    notOut: (name) => `${name} hiện không ra ngoài`,
  },

  shop: {
    title: 'CỬA HÀNG',
    shed: 'NHÀ KHO',
    aria: 'Cửa hàng',
    protect: 'BẢO VỆ HANG',
    protectAria: 'Bảo vệ hang của bạn',
    protectBuyAria: 'Bảo vệ hang - mua một cái bẫy',
    noTraps: 'HẾT BẪY - MUA THÊM',
    nothingBuried: 'CHƯA CHÔN GÌ',
    inShed: (n) => `${n} TRONG KHO`,
    rearming: (n) => `ĐANG NẠP LẠI - ${n} SẮP VỀ`,
    upAndRearming: (armed, rearming) => `${armed} ĐÃ GÀI - ${rearming} ĐANG NẠP`,
    inGround: (armed, max) => `${armed}/${max} DƯỚI ĐẤT`,
    openShed: 'Mở nhà kho',
    backToBurrow: 'Về hang',
    payWith: 'Trả bằng',
    outOfEnergy: 'HẾT NĂNG LƯỢNG',
    energySay: (cost, wait) =>
      `Một chuyến tốn ${cost}. Đủ để đi lại sẽ tự hồi sau ${wait}.`
      + ' Hoặc nạp đầy ngay và đào tiếp.',
    energySayEmpty: (wait) =>
      `Thanh đã cạn. Một điểm tự hồi sau ${wait}.`
      + ' Hoặc nạp đầy ngay và đào tiếp.',
    fillsTo: (max) => `Nạp đầy thanh tới ${max}.`,
    noRefills: ' Hôm nay hết lượt nạp.',
    refillsLeft: (n) => ` Hôm nay còn ${n} lượt nạp.`,
    cardsOff: 'Chưa mở thanh toán bằng thẻ. Tạm thời chỉ dùng cà rốt.',
    connectForCard: 'Kết nối ví để trả bằng thẻ. Mọi thứ ở đây cũng đào ra được.',
    eitherWay: 'Cà rốt tự đào, hoặc thẻ. Hàng như nhau.',
    pricing: 'Đang tính giá...',
    approve: 'Duyệt trong ví của bạn...',
    confirming: 'Đang xác nhận trên chuỗi...',
    priceLabel: (price) => `${price} cà rốt`,
    buy: (name, price) => `Mua ${name} với giá ${price}`,
    capped: (name, price) => `${name}: ${price}. Bạn đã mang tối đa rồi.`,
    /** The price button, armed: a second press buys. */
    confirmBuy: 'XÁC NHẬN?',
    yours: 'CỦA BẠN!',
    tooPoor: (name, price) => `${name}: ${price}. Chưa đủ cà rốt. Đi đào thêm.`,
    heldOf: (held, cap) => `${held}/${cap}`,
    heldToday: (n) => `${n} hôm nay`,
    heldDaysLeft: (n) => `còn ${n} ngày`,
    heldOff: 'tắt',
    boughtEnergy: (paid) => `Đã nạp năng lượng. ${paid}`,
    boughtTrap: (n, paid) => `${n > 1 ? `${n} bẫy` : 'Bẫy'} đã vào kho. ${paid}`,
    boughtBomb: (n, paid) => `${n > 1 ? `${n} bom` : 'Bom'} đã sẵn sàng. ${paid}`,
    boughtLightning: (n, paid) => `${n > 1 ? `${n} tia sét` : 'Tia sét'} đã vào chai. ${paid}`,
    boughtShield: (n, paid) => `${n > 1 ? `${n} khiên` : 'Khiên'} sẵn sàng. ${paid}`,
    boughtSmoke: (paid) => `Các con số đã bị che. ${paid}`,
    boughtBloop: (n, paid) => `${n > 1 ? `${n} bloop` : 'Bloop'} đã vào hũ. ${paid}`,
    boughtMirage: (n, paid) => `${n > 1 ? `${n} ảo ảnh` : 'Ảo ảnh'} sẵn sàng để ném. ${paid}`,
    /* Une clôture se DRESSE : le reçu nomme la planche qu'on va dresser. */
    boughtFence: (n, paid) => `${n > 1 ? `${n} tấm ván` : 'Tấm ván'} sẵn sàng để dựng. ${paid}`,
    paid: (spent) => `-${spent} 🥕`,
  },

  shopErrors: {
    fallback: 'Không được rồi.',
    insufficient_carrots: 'Không đủ cà rốt.',
    inventory_full: 'Túi của bạn đầy món này rồi.',
    daily_energy_limit: 'Hôm nay hết lượt nạp. Vườn vẫn lớn.',
    smoke_capped: 'Hang của bạn đã được che lâu nhất có thể.',
    too_many_at_once: 'Quá nhiều cùng lúc.',
    bad_quantity: 'Đó không phải một số lượng.',
    no_traps: 'Hết bẫy. Mua một cái, hoặc chờ mai.',
    board_full: 'Hang không chứa thêm bẫy được nữa.',
    tile_not_trappable: 'Không gài mìn ở đó được.',
    tile_doorstep: 'Quá gần cửa. Mấy bước đầu phải để trống.',
    tile_house: 'Không chôn gì dưới nhà bạn.',
    tile_field: 'Không chôn gì trong vườn bạn.',
    tile_already_trapped: 'Đã gài mìn rồi.',
    no_trap_there: 'Không có bẫy ở đó.',
    no_fences: 'Hết hàng rào. Kho có bán.',
    span_already_fenced: 'Đã có tấm ván dựng ở đó.',
    span_not_exposed: 'Đó không phải mép vườn của bạn.',
    /* La règle du portail, énoncée comme une règle : elle dit pourquoi avant
       de dire non. */
    would_seal_burrow: 'Thế là bịt lối vào cuối cùng. Luôn chừa một lối làm cổng.',
    span_not_fenced: 'Không có tấm ván ở đó.',
    bad_span: 'Chỗ đó không dựng ván được.',
    /* Le refus du PILLARD, depuis raid/route.ts : il l'oriente. */
    fenced: 'Hàng rào chắn đường. Đi vòng.',
    payments_unavailable: 'Thanh toán bằng thẻ chưa được thiết lập.',
    quote_expired: 'Báo giá đã hết hạn. Thử lại.',
    signature_already_used: 'Khoản thanh toán này đã được dùng.',
    not_confirmed_yet: 'Vẫn đang xác nhận trên chuỗi...',
    wrong_reference: 'Giao dịch này không khớp với lần mua này.',
    no_matching_transfer: 'Không tìm thấy lệnh chuyển USDC khớp.',
    failed_on_chain: 'Giao dịch thất bại trên chuỗi.',
  },

  pay: {
    needsBuild: 'Trả tiền trong app cần bản cập nhật tới. Tạm thời mua bằng cà rốt.',
    noWallet: 'Không có ví Solana. Cài Phantom để trả bằng USDC.',
    notConfigured: 'Máy chủ này chưa cấu hình thanh toán.',
    stillConfirming: 'Đã trả, đang xác nhận. Mở lại cửa hàng sau một phút. Không mất gì cả.',
    failed: 'Thanh toán thất bại',
    notEnough: (amount: string, symbol: string) => 'Không đủ ' + symbol + ': giá ' + amount + ' ' + symbol + '.',
    noToken: (symbol: string) => 'Ví này không có ' + symbol + '. Thử loại tiền khác.',
    linkWallet: 'Liên kết ví với hang của bạn để trả bằng tiền.',
    expired: 'Giá này đã hết hạn. Chạm lại để lấy giá mới.',
  },

  kit: {
    tools: {
      more: 'Xem hiệu ứng và thao tác', less: 'Thu gọn',
      available: (n) => n + ' sẵn có',
      placed: (n) => n + ' đã đặt',
      active: (time) => 'còn ' + time,
      buyTrap: (price) => 'Mua một bẫy - ' + price + ' cà rốt',
      trapHint: 'Chạm một ô để chôn bẫy. Chạm bẫy để lấy lại.',
      trapEmpty: 'Lấy lại một bẫy đã đặt hoặc mua thêm bên dưới.',
      fenceHint: 'Chạm một mép sáng để dựng. Chạm hàng rào để lấy lại.',
      raiseShield: 'Dùng một khiên', shieldActive: 'Hang của bạn đã được bảo vệ.',
      shopHint: 'Có bán ở cửa hàng.', notEnough: 'Không đủ cà rốt cho thêm một bẫy.',
      smokeHint: 'Mua khói ở cửa hàng là kích hoạt ngay.',
      attackHint: 'Dùng trên đảo của đối thủ trong một chuyến.',
      chestHint: 'Tìm thêm trong rương.',
      waterEffect: 'Giúp vườn lớn nhanh hơn một thời gian.',
      fertiliserEffect: 'Giúp vườn chứa nhiều cà rốt hơn trước khi đầy.',
      water: 'Tưới một lần', fertilise: 'Bón một lần',
    },
    aria: 'Những gì bạn mang theo',
    groupDefence: 'PHÒNG THỦ',
    groupAttack: 'TẤN CÔNG',
    groupGarden: 'VƯỜN',
    shieldHolding: (wait, held) => `Khiên: đang dựng, còn ${wait}. ${held} trong túi.`,
    shieldReady: (held) => `Khiên: ${held} trong túi. Dựng một cái. Kẻ cướp bật ra khi khiên còn.`,
    shieldNone: 'Khiên: không có. Mua ở cửa hàng.',
    smokeOff: 'Màn khói: tắt. Mua ở cửa hàng để che các con số.',
    smokeUp: (days) =>
      `Màn khói: đang bật, còn ${days} ngày.`
      + ' Kẻ cướp đi qua hang bạn trong mù mịt.',
    carried: (name, held, blurb) => `${name}: ${held} trong túi. ${blurb}`,
    carriedNone: (name, blurb) => `${name}: không có. ${blurb}`,
    trapsLine: (placed, max, held) =>
      `Bẫy: ${placed}${max ? `/${max}` : ''} dưới đất, ${held} trong kho.`
      + ' Chôn chúng từ PHÒNG THỦ.',
    trapsBuy: (held, price) =>
      (held > 0
        ? `Bẫy: ${held} trong kho. Mua thêm một cái giá ${price} cà rốt.`
        : `Bẫy: kho trống. Mua một cái giá ${price} cà rốt.`),
    trapsBuyBroke: (price) =>
      `Bẫy: hết sạch. Một cái giá ${price} cà rốt - đi đào thêm.`,
    trapsBuyFull: (held) => `Bẫy: ${held} trong kho. Kho đã đầy.`,
    bottleRunning: (name, wait, count) => `${name}: đang chạy, còn ${wait}. ${count} trong túi.`,
    bottleHeld: (name, count) => `${name}: ${count} trong túi. Đổ một cái lên vườn.`,
    bottleNone: (name) => `${name}: không có. Tìm trong rương.`,
    /* LA CASE CLÔTURE. `total` compte tous les tronçons, portail compris ; le
       dernier ne se ferme jamais, et fenceAllWalled le dit. */
    fencePlace: (held, walled, total) =>
      `Hàng rào: ${held} tấm ván trong túi, đã rào ${walled}/${total} đoạn.`
      + ' Dựng một tấm.',
    fenceAllWalled: (walled) =>
      `Hàng rào: đã rào ${walled} đoạn.`
      + ' Lối cuối cùng là cổng và luôn để mở.',
    fenceNone: (walled) =>
      `Hàng rào: túi trống, đã rào ${walled} đoạn.`
      + ' Kho có bán. Chạm tấm ván đang dựng để lấy lại.',
    watering: 'Tưới nước',
    fertiliser: 'Phân bón',
  },

  energyPanel: {
    open: 'Chi tiết năng lượng',
    title: 'NĂNG LƯỢNG',
    reading: (energy, max) => `${energy}/${max}`,
    rate: (regen) => `+${regen}/h`,
    full: 'đầy',
    fullIn: (wait) => `đầy sau ${wait}`,
    island: 'Đảo',
    islandCost: (cost) => `${cost} để qua, rồi 1 mỗi lần đào`,
    raid: 'Cướp',
    raidCost: (toll, stake) => `${toll} để vào, tối đa ${stake}`,
    raidRefund: 'Tới được vườn là bước chân được hoàn lại.',
    dig: 'Đào',
    digCost: (dig, bomb) => `${dig} mỗi ô. Một quả bom: ${bomb}`,
    x: 'X đỏ',
    xCost: (lo, hi, loss) => `đúng: +${lo} tới +${hi}. Sai: -${loss}`,
    home: 'Về hang',
    homeCost: (floor) => `về với ${floor} trở lên là sẵn sàng đi cướp`,
    homeHint: 'Mang về bao nhiêu thì giữ trong bình bấy nhiêu.',
    ready: 'Sẵn sàng',
    raidReady: 'Sẵn sàng cướp',
    needs: (floor) => `Cần ${floor}`,
    inWait: (wait) => `sau ${wait}`,
    under: (floor) => `Dưới ${floor}`,
    levelLabel: (level) => `Cấp ${level}`,
    levelRate: (regen, next) =>
      next === null ? `hồi ${regen} mỗi giờ` : `hồi ${regen} mỗi giờ. Cấp sau: ${next}`,
  },
  rabbitLevel: {
    badge: (n: number) => `CẤP ${n}`,
    up: (n: number) => `CẤP ${n}`,
    harder: 'Các đảo khó dần lên',
    final: 'Những đảo cuối cùng',
    raidsOpen: 'Đã mở cướp',
    raidLocked: (n: number) => `Mở cướp ở cấp ${n}. Dọn đảo để lên tới đó.`,
  },
  islandPick: {
    choose: 'Chọn một hòn đảo',
    which: 'ĐẢO NÀO?',
    loading: 'Đang nhìn ra biển...',
    row: (rabbits, left, total, dug) => `${rabbits} đang đào · còn ${left}/${total} rương · đã đào ${dug}%`,
    rowEmpty: (left, total, dug) => `giờ không ai trên đảo · còn ${left}/${total} rương · đã đào ${dug}%`,
    fresh: 'Chưa ai lên đảo',
    join: 'Tham gia',
    open: 'Mở',
    locked: (n) => `Mở khi đã đào ${n} cà rốt`,
    lockedShort: 'Đã khóa',
    brief: 'Đảo đông người là một lượt đào ngắn, an toàn, chia phần rương. Đảo mới là chặng đường dài.',
    almostDone: 'sắp xong',
    best: (n) => `kỷ lục của bạn ${n} 🥕`,
    gone: 'Đảo đó đã đầy hoặc đã kết thúc. Chọn đảo khác.',
    tierLocked: 'Bạn chưa đào tới được đảo đó.',
    youHave: (n) => `bạn có ${n}`,
    tier: (bombs, x) => `${bombs}% bom · X đúng +${x}`,
  },
  raid: {
    go: 'ĐI CƯỚP',
    another: 'Cướp một hang khác',
    choose: 'Chọn một hang',
    whose: 'HANG CỦA AI?',
    cost: (toll, stake) => `Một lần cướp tốn ${toll} năng lượng để vào, tối đa ${stake}.`,
    allShielded: 'MỌI HANG ĐỀU CÓ KHIÊN',
    nobody: 'KHÔNG CÓ AI ĐỂ CƯỚP',
    shielded: 'Có khiên',
    presence: {
      away: 'vắng nhà',
      home: 'ở nhà',
      digging: 'đi đào',
    },
    raidIt: 'Cướp',
    watchIt: 'Xem',
    brief: 'Tới được ruộng cà rốt. Bẫy của họ chôn kín, không đánh dấu.',
    outOfEnergy: 'Hết năng lượng',
    nothingTaken: 'Không lấy được gì',
    unguarded: (amount) => `${amount} KHÔNG AI CANH`,
    nobodyYet: 'Chưa ai khác có hang.',
    steps: 'bước',
    stepsBack: (n) => `Tới ruộng rồi: ${n} bước được hoàn lại`,
    looted: (n) => `+${n} 🥕`,
    won: 'CƯỚP THÀNH CÔNG!',
    backToBurrow: 'VỀ HANG',
    aRival: 'MỘT ĐỐI THỦ',
    lootedFrom: (name) => `CƯỚP TỪ ${name}`,
    wasEmpty: (name) => `HANG CỦA ${name} TRỐNG RỖNG`,
    trapsSprung: (n) => `${n} BẪY ĐÃ SẬP TRÊN ĐƯỜNG VÀO`,
    wonAria: (carrots, name) => `Cướp thành công - ${carrots} cà rốt lấy từ ${name}`,
    rabbitAria: 'Thỏ của bạn đang ăn mừng',
    stolen: (n, name) => `+${n} 🥕 cướp từ ${name}`,
    fellShort: (pct, name) => `Dừng ở ${pct}% đường tới ruộng của ${name}`,
    defended: 'ĐÃ GIỮ ĐƯỢC',
    raided: 'BỊ CƯỚP',
    byWho: (who, n) => `BỞI ${who} · -${n} CÀ RỐT`,
    byWhoNothing: (who) => `BỞI ${who}`,
    bounced: (n) => `${n} LẦN CƯỚP BỊ ĐẨY LÙI`,
    struck: 'Bị sét đánh',
    struckBy: (name) => `${name} gọi sét giáng xuống bạn`,
  },

  /* ── Ton terrier attaqué, vu de chez toi ─────────────────────────────── */
  defend: {
    clean: 'GỠ HẾT',
    cleanSure: 'CHẮC CHƯA?',
    cleaned: (bombs, planks) => `${bombs} bom và ${planks} hàng rào đã về lại túi`,
    underAttack: (name) => `${name.toUpperCase()} ĐANG CƯỚP HANG BẠN`,
    theirSteps: 'bước chân họ',
    hint: 'Chôn bom trước mặt họ, hoặc chạm con thỏ để giáng sét.',
    strike: 'Giáng sét',
    buyStrike: 'Mua và đánh',
    held: (n) => `còn ${n}`,
    struckDown: 'BỊ SÉT ĐÁNH',
    ranDry: 'HỌ ĐÃ CẠN NĂNG LƯỢNG',
    looted: (n) => `HỌ ĐÃ LẤY ${n} 🥕`,
    lost: 'Hang của bạn đã bị cướp',
    held_: 'Hang đã giữ được',
    incoming: (name) => `${name} đang cướp hang bạn!`,
  },

  raidErrors: {
    fallback: 'Không được rồi.',
    target_shielded: 'Hang của họ có khiên. Thử người khác.',
    cannot_raid_yourself: 'Đó là hang của chính bạn.',
    raid_in_progress: 'Bạn đang ở trong một hang rồi.',
    cooldown: 'Bạn vừa cướp họ gần đây quá.',
    no_energy: 'Không đủ năng lượng để qua. Chờ, hoặc nạp thêm.',
    not_adjacent: 'Quá xa. Từng bước một.',
    raid_over: 'Lần cướp này đã kết thúc.',
    none_held: 'Không có sét để gọi. Kho có bán.',
    no_raid: 'Lần cướp này đã xong.',
    unknown_player: 'Họ biến mất rồi.',
  },

  chest: {
    carrots: 'CÀ RỐT',
    watering: 'TƯỚI NƯỚC',
    fertiliser: 'PHÂN BÓN',
    bomb: 'BOM',
    shield: 'KHIÊN',
    lightning: 'SÉT',
    genesis: 'RR GENESIS',
    piece: (amount, label) => `MỘT PHẦN LÀ CỦA BẠN - THÊM ${amount}x ${label}`,
  },

  profile: {
    /* L'en-tête nomme le panneau, pas l'onglet ouvert. */
    title: 'HỒ SƠ',
    tabProfile: 'Hồ sơ',
    tabHistory: 'Lịch sử',
    name: 'Tên',
    save: 'Lưu tên',
    saving: 'Đang lưu...',
    taken: (name) => `Chơi với tên « ${name} »`,
    waitingWallet: 'Đang chờ ví...',
    signInWith: 'Đăng nhập bằng ví này',
    disconnect: 'Ngắt kết nối',
    abandon: 'Bỏ hang này',
    abandonConfirm: 'Thật sự bỏ? Không thể hoàn tác',
    loading: 'Đang tải...',
    now: 'vừa xong',
    historyFailed: 'Không tải được lịch sử của bạn.',
    noRuns: 'Chưa có chuyến nào hoàn thành.',
    noRaids: 'Chưa ai đụng tới bạn.',
    noPurchases: 'Chưa mua gì từ kho.',
    today: 'Hôm nay',
    youHit: (name) => `Bạn đánh ${name}`,
    damage: (n) => `${n} st`,
    shovedIn: 'bị đẩy xuống nước',
    struckDown: 'bị sét đánh',
    youShoved: (name) => `Bạn đẩy ${name} xuống nước`,
    youStruck: (name) => `Bạn giáng sét ${name}`,
    spent: (n) => `-${n} 🥕`,
    usd: (n) => `$${n}`,
    revenge: 'TRẢ THÙ NGAY',
    avenged: 'đã trả',
    revengeShielded: 'Có khiên',
  },

  avatars: {
    brown: 'Nâu',
    gray: 'Xám',
    orange: 'Cam',
    white: 'Trắng',
    yellow: 'Vàng',
  },

  codex: {
    title: 'VƯƠNG MIỆN BỊ NGUYỀN',
    aria: 'Truyện về vương miện bị nguyền',
    close: 'Đóng sách',
    newChapter: 'CHƯƠNG MỚI',
    complete: 'HOÀN TẤT',
    isNew: 'MỚI',
    sealed: (at, have) => `Niêm phong tới khi đủ ${at} cà rốt tích lũy. Bạn có ${have}.`,
    nextIn: (n) => `Chương sau cần thêm ${n} cà rốt`,
    lifetimeOnly: 'Chỉ tính cà rốt tích lũy. Không ai cướp được gì ở đây.',
    done: 'Sách đã đủ chương. Hòn đảo vẫn đang chờ.',
    carrotsAt: (n) => `${n} cà rốt`,
    chapterN: (n) => `Chương ${n}`,
    chapters: 'Các chương',
  },

  quest: {
    claim: 'NHẬN',
    claimItem: (qty, kind) => `NHẬN ${qty} ${kind.toUpperCase()}`,
    claimCarrots: (n) => `NHẬN ${n} 🥕`,
    aria: (reward, title) => `${reward} cho ${title}`,
    progress: (progress, goal) => `${progress}/${goal}`,
    counter: (index, total) => `NHIỆM VỤ ${index} / ${total}`,
  },

  /* Les règles du jeu, sur la planche du pas-de-porte. Voir en.ts : ce sont
     des FAITS, et les chiffres sont ceux de config/tuning.ts. */
  doorstepTips: [
    'SỐ TRÊN MỘT Ô ĐẾM SỐ BOM CHẠM VÀO NÓ',
    'ĐÀO TỐN 1 NĂNG LƯỢNG - DẪM BOM TỐN 30',
    'ĐÁNH DẤU BOM BẰNG X ĐỎ: ĐÚNG ĐƯỢC HOÀN NĂNG LƯỢNG, SAI MẤT 15',
    'ĐI LẠI TRÊN Ô ĐÃ ĐÀO LÀ MIỄN PHÍ',
    'MỌI RƯƠNG BẠN MỞ ĐỀU THEO BẠN VỀ',
    'HÒN ĐẢO LÀ ĐỒNG HỒ - ĐÀO SẠCH LÀ NÓ CHÌM',
    'CÀ RỐT LÀ ĐIỂM SỐ - X ĐỎ LÀ CÁCH DUY NHẤT ĐỂ HỒI SỨC',
  ],

  taglines: [
    'MỖI BƯỚC CÓ THỂ LÀ BƯỚC CUỐI... HOẶC LÀ VẬN MAY',
    'VƯỢT ĐẢO, GIÀNH VÀNG, HOẶC CHẾT KHI CỐ GẮNG',
    'KẺ GAN NHẢY XA HƠN - KẺ MAY NHẢY VỀ NHÀ',
    'TỪNG BƯỚC MỘT, ĐẢO LẤY ĐI HOẶC ĐẢO BAN CHO',
    'CHỈ KẺ LIỀU SỐNG SÓT - CHỈ KẺ KHÔN BIẾT DỪNG',
  ],

  islands: {
    Meadow: 'Đồng cỏ',
    Thicket: 'Bụi rậm',
    Ashland: 'Đất tro',
    Caldera: 'Miệng núi lửa',
  },

  items: {
    trap: {
      name: 'Bẫy',
      blurb: 'Chôn trong hang bạn. Nó rút cạn sức kẻ cướp dẫm phải.',
    },
    bomb: {
      name: 'Bom',
      blurb: 'Đặt lên đảo của ai đó giữa chuyến. Họ sẽ biết là bạn.',
    },
    lightning: {
      name: 'Sét',
      blurb: 'Gọi sét xuống đảo đối thủ. Nó mở toang đất xung quanh.',
    },
    shield: {
      name: 'Khiên',
      blurb: 'Kẻ cướp bật khỏi hang bạn khi khiên còn.',
    },
    energy: {
      name: 'Năng lượng',
      blurb: 'Nạp đầy thanh và đào ngay, khỏi phải chờ.',
    },
    smoke: {
      name: 'Màn khói',
      blurb: 'Che các con số trong hang bạn một ngày. Kẻ cướp đi qua trong mù mịt.',
    },
    bloop: {
      name: 'Bloop',
      blurb: 'Phun mực vào mắt đối thủ. Vài giây không thấy gì — cũng không về được.',
    },
    mirage: {
      name: 'Ảo ảnh',
      blurb: 'Làm vài con số của đối thủ nói dối, giữa chuyến. Họ có thể nhận ra.',
    },
    /* La seule défense FAITE pour être vue : « không vượt qua được », pas
       « làm chậm ». Voir lib/game/fences.ts. */
    fence: {
      name: 'Hàng rào',
      blurb: 'Rào một đoạn mép vườn. Kẻ cướp không vượt qua được.',
    },
  },

  quests: {
    'break-ground': {
      title: 'Vỡ đất',
      ask: (tiles) => `Đào ${tiles} ô.`,
      line: 'Mỗi ô đã đào cho biết bao nhiêu bom chạm vào nó. Chính xác. Các con số không nói dối.',
    },
    'come-home': {
      title: 'Về nhà',
      ask: () => 'Hoàn thành một chuyến.',
      line: 'Thứ bạn mang theo giờ đã ở trong hang. Không gì trên đảo chạm tới được.',
    },
    'bring-it-in': {
      title: 'Thu về',
      ask: () => 'Thu hoạch vườn.',
      line: 'Vườn lớn khi bạn vắng nhà. Thứ kẻ trộm mang đi được cũng vậy.',
    },
    'bury-something': {
      title: 'Chôn thứ gì đó',
      ask: () => 'Vào PHÒNG THỦ và đặt vài quả bom trong hang.',
      line: 'Cái bẫy không ai thấy là bức tường duy nhất đáng xây. Tường thì người ta đi vòng.',
    },
    'open-a-chest': {
      title: 'Mở một rương',
      ask: () => 'Đào lên một cái rương trên đảo.',
      line: 'Rương là một lời hứa. Cũng là một lần bước qua mảnh đất bạn chưa đọc.',
    },
    'knock-on-a-door': {
      title: 'Gõ cửa',
      ask: () => 'Cướp một hang. Sâu cỡ nào cũng tính.',
      line: 'Thứ duy nhất lấy được từ một con thỏ là thứ nó để lại phía sau.'
        + ' Giờ bạn đã đứng ở cả hai phía.',
    },
    'look-up': {
      title: 'Ngẩng đầu lên',
      ask: () => 'Mở bảng xếp hạng mùa.',
      line: 'Có kẻ đang đội vương miện. Nó thắp đèn trên mọi tấm bản đồ, và không bao giờ tắt.',
    },
    'read-the-stones': {
      title: 'Đọc những hòn đá',
      ask: (numeral) => `Mở chương ${numeral} của sách.`,
      line: 'Hòn đảo không giết kẻ xui. Nó giết kẻ vội,'
        + ' và ghi chép cẩn thận sự khác biệt.',
    },
    'hold-the-door': {
      title: 'Giữ cửa',
      ask: (traps) => `Có ${traps} bẫy dưới đất trước khi khiên hạ.`,
      line: 'Khiên sắp hạ. Sau đó, bạn chỉ còn mặt đất. Làm cho nó thật đắt giá.',
    },
    'the-thicket': {
      title: (island) => `${island}`,
      ask: (carrots) => `Đạt ${carrots} cà rốt tích lũy.`,
      line: 'Đất màu mỡ hơn, và chôn nhiều thứ hơn.'
        + ' Hòn đảo gọi đó là trao đổi công bằng và không chờ bạn trả lời.',
    },
  },

  lore: {
    'the-island': {
      title: 'Hòn đảo biết cho',
      teaser: 'Vì sao đất lại hào phóng.',
      body: [
        'Không ai trồng củ cà rốt đầu tiên. Người ta chỉ tìm thấy hòn đảo, vào một buổi '
        + 'sáng, đã đầy sẵn — từng hàng vương miện màu cam trồi lên khỏi lớp cát thủy triều '
        + 'vừa rút. Lũ thỏ tìm ra nó đã làm điều hợp lý. Chúng đào.',

        'Nó chưa bao giờ ngừng cho. Đào một cái hố và đất sẽ dâng lên thứ gì đó: một '
        + 'củ cà rốt, một cái rương, một hòn đá khắc con số. Các con số trung thực. '
        + 'Chúng luôn trung thực. Đó chính là điều lũ thỏ già cảnh báo bạn — một thứ '
        + 'không bao giờ nói dối bạn là một thứ đang muốn gì đó, và nó đủ kiên nhẫn '
        + 'để chờ tới lúc bạn hỏi đó là gì.',
      ],
    },
    'the-numbers': {
      title: 'Điều các con số biết',
      teaser: 'Đất đếm những gì nó đã chôn.',
      body: [
        'Một ô đã đào cho bạn biết bao nhiêu quả bom chạm vào nó. Không phải áng chừng. '
        + 'Chính xác. Chưa con thỏ nào tìm thấy hòn đá biết nói dối, và lũ thỏ đã tìm '
        + 'rất kỹ, thường là lúc đã mất một chân.',

        'Nên hiểm họa không bao giờ là con xúc xắc. Hiểm họa là bạn, đọc vội vì '
        + 'có kẻ khác cách ba ô đang với tay tới cùng một củ cà rốt. Hòn đảo không '
        + 'giết kẻ xui. Nó giết kẻ vội, và ghi chép cẩn thận sự khác biệt.',
      ],
    },
    'the-burrow': {
      title: 'Luật của hang',
      teaser: 'Không ai lấy gì của bạn khi bạn đang đào.',
      body: [
        'Ngoài đảo bạn không thể thua. Dẫm phải bom là bạn bị hất văng, choáng váng, '
        + 'hụt hơi — nhưng đống của bạn không suy suyển. Mọi củ cà rốt bạn từng mang '
        + 'về vẫn còn ở nhà.',

        'Đó chính là vấn đề. Nhà là nơi có mọi thứ, và nhà là nơi bạn không ở, '
        + 'vì bạn đang ở đây, đào. Hòn đảo biến điều đó thành luật và thấy nó rất '
        + 'buồn cười: thứ duy nhất lấy được từ một con thỏ là thứ nó để lại phía sau.',
      ],
    },
    'the-crown': {
      title: 'Vương miện không phải phần thưởng',
      teaser: 'Nó đánh dấu bạn trên mọi bản đồ.',
      body: [
        'Ai giữ mùa lớn nhất sẽ thấy vương miện nằm trên đầu mình vào một buổi '
        + 'sáng. Không thể tháo, bán, chôn hay cho đi. Lũ thỏ đã thử cả bốn cách. '
        + 'Có một chương về cách thứ tư, và nó ngắn.',

        'Vương miện hào phóng, đó là cách nó vận hành. Nó làm đất dưới chân người đội '
        + 'màu mỡ hơn và rương nặng hơn. Nó cũng thắp trên bản đồ thế giới một ngọn '
        + 'đèn mà mọi con thỏ khác nhìn thấy từ bất cứ đâu, và không bao giờ tắt. '
        + 'Hòn đảo không thưởng cho con thỏ đứng đầu. Nó rọi sáng con thỏ ấy, rồi '
        + 'lùi lại xem những con khác sẽ làm gì.',
      ],
    },
    'the-tide': {
      title: 'Khi hòn đảo đã cho đủ',
      teaser: 'Biển giữ sổ sách.',
      body: [
        'Một hòn đảo nổi nhờ những gì nó giữ. Mỗi cái rương là một vật dằn, và biển '
        + 'đã chờ bên dưới tất cả chúng từ đầu. Lấy cái cuối cùng là nước dâng lên '
        + 'mảnh đất bạn đã đào — không mặc cả, không lấp lại những gì đã mở. '
        + 'Hòn đảo là thứ chỉ xảy ra một lần. Nó cho tới khi hết rương, rồi chìm '
        + 'xuống chẳng cần nghi lễ gì và lũ thỏ bơi.',

        'Lũ thỏ già không coi đó là thảm họa. Chúng coi đó là một món nợ được '
        + 'thanh toán. Có thứ đã bị lấy khỏi thế giới, với số lượng khổng lồ, bởi '
        + 'những con thỏ được nói sự thật chính xác về từng bước và vẫn chọn đi '
        + 'tiếp. Hòn đảo chỉ đơn giản trở về với nước, và một hòn khác nổi lên ở '
        + 'đâu đó, đã đầy cà rốt, đã ấm sẵn.',
      ],
    },
  },
};
