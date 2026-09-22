# Rabbit Royale — le client Godot

Le même jeu que le web, en application native (Android/Seeker d'abord, bureau
et iOS ensuite). Le serveur ne change pas d'une ligne : les 21 routes et la
socket sont celles de `ws.rabbit.rip`, avec le même JWT.

## Lancer

Godot 4.7, rendu « GL Compatibility ». Ouvrir `godot/` dans l'éditeur et
presser F5 — la fenêtre s'ouvre maximisée sur PC (le 890x400 est la taille de
référence, celle du Seeker couché, pas la taille de la fenêtre).

Depuis la ligne de commande, une capture sans éditeur :

    godot --path godot -- --shot=C:/tmp/shot.png --after=4
    godot --path godot scenes/ui_bench.tscn -- --shot=C:/tmp/bench.png

Le wallet n'existe que dans un build Android ; sur bureau, la porte invitée
suffit pour tout voir.

## Où sont les choses

| Chemin | Ce que c'est |
| --- | --- |
| `scenes/main.tscn` | La racine, jamais rechargée : World / Screen / Chrome / Wipe. |
| `scripts/screens.gd` | Le routeur : le doorstep est un ÉCRAN, le terrier et l'île sont des LIEUX résidents. |
| `scripts/title.gd` | L'accueil (doorstep). |
| `scripts/burrow*.gd` | Le terrier : terrain, décors, clôtures, lapin, caméra. |
| `scripts/chrome.gd` | Le chrome au-dessus du monde : barre du haut, colonne, sol, pastilles, dialogues. |
| `scripts/ui/` | Les pièces partagées du chrome (voir ci-dessous). |
| `scenes/ui/` | Chaque panneau du chrome, une scène chacun. |
| `scripts/session.gd`, `net.gd`, `game_socket.gd`, `wallet.gd` | La session, les appels, la socket, le Seed Vault. |
| `scripts/home.gd` | Le terrier du joueur (`/api/burrow`), la quête, les gestes (récolter, améliorer…). |
| `scripts/i18n.gd` + `assets/i18n/*.json` | Les quatre langues, exportées du web. |
| `scripts/tuning.gd` + `assets/tuning.json` | Les nombres de `config/tuning.ts`, exportés du web. |
| `scripts/content.gd` | Les chapitres, la prose des quêtes, la ligne « et maintenant ». |

## Les mots et les nombres viennent du web

Ne retapez jamais une chaîne ni un nombre de design. Ils s'exportent :

    bun tools/export-godot-i18n.ts     # src/i18n/dict/*.ts -> godot/assets/i18n/*.json
    bun tools/export-godot-tuning.ts   # config/tuning.ts   -> godot/assets/tuning.json

Les JSON sont commis, un checkout frais n'a pas besoin de bun. Côté Godot :

```gdscript
I18N.t("shop.title")                       # une chaîne, chemin du web
I18N.f("loop.traps", [n])                  # une chaîne à trous (fonction du web)
I18N.list("doorstepTips")                  # une liste
I18N.shout(text)                           # MAJUSCULES seulement en anglais (face pixel)
I18N.wait(ms), I18N.group_digits(n)        # format.ts
Tuning.i("ENERGY.MAX"), Tuning.raid_floor(), Tuning.upgrade_cost(level)
```

La face de la langue (pixel pour l'anglais, une face système pour le reste)
est posée sur le thème du projet par `I18N` : aucun label n'a à s'en occuper.

## Les pièces du chrome (`scripts/ui/`)

Le web fait passer tout son chrome par une peau (`woodland/runtime.tsx`) qui
choisit la MATIÈRE d'une surface d'après son rôle. `Kit` est cette peau :

```gdscript
Kit.parchment()                 # le cadre à feuilles d'un dialogue (NineSlice)
Kit.plank("gold")               # une planche : wood / gold / green / danger / blue
Kit.button("HARVEST", "green")  # un PlankButton, mêmes tons
Kit.style_well(), style_badge(), style_track(), style_tab(on), style_caption(), style_soil()
Kit.caption("…", refused)       # la pastille sombre des messages
Kit.label(text, size, color), Kit.title(text), Kit.note(text)
Kit.icon(Kit.ICONS["carrot"], 28), Kit.close_button()
Kit.EDGE, Kit.PAD, Kit.PAD_TIGHT, Kit.TOPBAR_H   # les mesures de globals.css
```

`Palette` porte les couleurs (terre, bois, parchemin, encres). `NineSlice`
dessine un art découpé aux marges d'ÉCRAN qu'on lui donne (le web dessine 110
pixels de source sur 36 ; NinePatchRect ne sait pas). `Dialog` est le
parchemin + titre + [x] à cheval sur le coin ; `Chrome.current.open(dialog)`
le pose sur un voile, un seul à la fois. `Chrome.current.toast(text, refused)`
dit ce que le terrier répond.

Tout ce qui est image est en `preload` : un `load()` d'un chemin n'est pas vu
par l'exportateur Android et manque à l'APK.

## Conventions

- Commentaires en français, dans la voix de `scripts/title.gd` : ce que le
  fichier décide et POURQUOI, en citant la décision du web qu'il reprend.
- Indentation : tabulations. Types explicites (`var x := …`, `-> void`).
- Un panneau = une scène sous `scenes/ui/` + un script sous `scripts/ui/`. Il
  lit `Home`, `Session`, `GameSocket`, `Screens`, `Tuning`, `I18N` lui-même,
  se cache seul quand le lieu ne le concerne pas, et se réécrit sur
  `I18N.locale_changed`.
- Un banc par panneau sous `scenes/bench/`, avec des données factices, pour
  le voir sans compte : `godot --path godot scenes/bench/x.tscn -- --shot=…`.
- Les pièces partagées (`kit.gd`, `palette.gd`, `dialog.gd`, `chrome.gd`,
  `home.gd`, `i18n.gd`) évoluent par une seule main à la fois.

## État du portage

| Surface | Web | Godot |
| --- | --- | --- |
| Doorstep (accueil, langues, session) | `page.tsx`, `logo-banner.tsx` | `title.gd` ✓ |
| Terrier (sol, décors, clôtures, lapin, caméra) | `game/burrow/*` | `burrow*.gd` ✓ — la maison suit le niveau et fête son passage ; pièges, bombes : à venir (le terrain est encore l'île provisoire, pas `burrowFor(playerId)` du serveur) |
| Chrome : hôte, dialogues, pastilles | `page.tsx`, `px-dialogs.css` | `chrome.gd`, `dialog.gd` ✓ |
| Barre du haut : joueur, pastille, rail, son | `carrot-pill.tsx`… | `top_bar.gd` ✓ (monté par `chrome.gd`) |
| Colonne : quête, jardin, terrier | `quest-card.tsx`… | `burrow_column.gd` ✓ |
| Sol : DIG · DEFEND · RAID, mode défense | `loop-bar.tsx`, `kit-row.tsx` | `loop_bar.gd`, `kit_row.gd`, `defend_hud.gd` ✓ |
| Saison, profil, langue | `leaderboard-drawer.tsx`, `profile-menu.tsx` | ✓ (ouverts par `chrome.gd`) |
| Boutique, énergie | `shop-card.tsx`, `energy-*.tsx` | ✓ — l'achat s'arrête : le pont natif ne signe pas encore |
| Codex, tampons | `lore-codex.tsx`, `*-stamp.tsx` | ✓ |
| Coffre | `chest-*.tsx` | `chest_prize.gd` écrit, **pas monté** |
| Île : choix d'île | `island-picker.tsx` | `island_picker.gd` ✓ |
| Île : HUD, récap | `run-hud.tsx`, `run-recap.tsx` | `run_hud.gd` + `run_recap.gd` écrits, **pas montés** — l'île montre son HUD provisoire (`island.gd`) |
| Île : cases, décor, caméra, éruption | `game/island/*` | cases de la leçon ✓ (carotte prise, bombe et cratère, coffre qui s'envole) ; éruption et grondement ✓, branchés sur `RunState` en attendant les manches en ligne ; décor et caméra des îles générées : à venir |
| Raid : cibles, HUD, victoire | `raid-panel.tsx`, `defend-hud.tsx`, `raid-victory.tsx` | `target_list.gd`, `raid_hud.gd`, `raid_victory.gd` ✓ |
| Rideau de traversée | `carrot-curtain.tsx`, Pixi | `iris_wipe.gd` ✓ — une variante sur les cinq du web |
| Sons, musique | `SoundManager` | `sound.gd` ✓ |
| Install PWA, rotate gate, fullscreen | — | sans objet en natif |
