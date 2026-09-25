# Episodes

Teasers courts pour X. Chaque épisode est **autonome** — pas de continuité,
pas de numérotation visible à l'écran, pas de « la semaine prochaine ».
On refait la semaine suivante s'il y a du retour, sinon on change.

## Format

| | |
|---|---|
| Durée | ~17-18s (7-8s HQ + 10s gameplay) |
| Ratio | 1:1 carré (ou 4:5) — pas de 16:9, ça mange la hauteur dans la timeline |
| Son | **Muet par défaut.** Rien d'important ne passe par l'audio. |
| Upload | Vidéo **native** X. Jamais un lien YouTube, l'algo l'écrase. |
| Lien | Dans un reply, pas dans le post principal. |

## Règles de découpage

1. **La seconde 0 doit être lisible.** Pas de fondu au noir, pas de logo,
   pas d'établissement. On entre dans l'image.
2. **Une idée par clip.** Si on doit expliquer, c'est raté.
3. **Le HQ pose la règle, le gameplay la prouve.** La soudure entre les deux
   parties, c'est le hors-champ : ce que le lapin voit en HQ, on y joue après.
4. **Le lapin ne parle pas.** Il réagit. C'est ce qui le rend exportable.

## Arborescence

```
episodes/
  ep01-carotte-bombe/
    script.md       — le découpage plan par plan
    shots/          — prompts + images de référence par plan
```

## État

| Ep | Titre | État |
|----|-------|------|
| 01 | Carotte / bombe | **Monté** — `ep01-x.mp4` (29,7 s). Intro Seedance, gameplay filmé dans Godot (`capture.sh`), `montage.sh` |
