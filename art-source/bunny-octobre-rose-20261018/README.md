# Skin Octobre rose

Skin de sensibilisation au cancer du sein, dessinée avec l’API native d’Aseprite : pelage rose poudré, oreilles fuchsia, pattes crème et ruban rose sur le flanc. Version validée visuellement par Peko le 18 octobre 2026.

- `bunny-octobre-rose-animation.aseprite` : animation éditable, 64 cases de 32 × 32 pixels et 7 tags.
- `bunny-octobre-rose-sheet.aseprite` : planche éditable avec grille de 32 × 32 pixels.
- `bunny-octobre-rose.png` : atlas transparent de 256 × 256 pixels au format du jeu.
- `bunny-octobre-rose-idle.gif` : aperçu animé agrandi sans lissage.
- `bunny-octobre-rose-preview.png` : aperçu de la pose au repos.
- `bunny-octobre-rose-poses.png` : planche de contrôle de toutes les poses.

Les deux fichiers Aseprite ont quatre calques : source blanche verrouillée, pelage rose, pattes et queue crème, ruban. Le ruban est adapté aux poses et masqué par les pattes et contours d’origine. La silhouette, l’alpha, l’ordre des cases et les cases vides sont conservés.

| Tag | Indices de l’atlas, à partir de 0 | Cadence |
| --- | --- | --- |
| idle | 0–7 | 8 i/s |
| move | 8–15 | 12 i/s |
| eat | 16–23 | 8 i/s |
| sleep | 32–39 | 4 i/s |
| happy | 40–47 | 10 i/s |
| damage | 48–52 | 12 i/s |
| death | 56–61 | 8 i/s |

Cadences arrondies à la milliseconde dans Aseprite. `damage` s’arrête à la dernière case dessinée, comme dans `IslandRabbit.LAST_PAINTED`.

Recréation depuis la racine du dépôt :

```sh
/Applications/Aseprite.app/Contents/MacOS/aseprite -b --script art-source/bunny-octobre-rose-20261018/create.lua
/Applications/Aseprite.app/Contents/MacOS/aseprite -b art-source/bunny-octobre-rose-20261018/bunny-octobre-rose-animation.aseprite --tag idle --crop 4,12,24,20 --save-as art-source/bunny-octobre-rose-20261018/bunny-octobre-rose-idle.gif
/Applications/Aseprite.app/Contents/MacOS/aseprite -b art-source/bunny-octobre-rose-20261018/bunny-octobre-rose-idle.gif --scale 12 --save-as art-source/bunny-octobre-rose-20261018/bunny-octobre-rose-idle.gif
```

Les fichiers sont prêts pour l’intégration ; le catalogue des skins du jeu n’est pas modifié.
