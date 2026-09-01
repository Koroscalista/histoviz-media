# Format de la file — « Bloc 1 »

**Le contrat qui fait foi est `stathisto/pipeline/README.md`** (module déterministe
`pipeline/etats.py`). Ce fichier n'en est qu'un rappel côté publisher : Runner B **consomme**
ce format, il ne le définit pas et ne le génère pas.

La file est le dossier **`file/`** : **un item = un fichier `<slug>.json`** (jamais un pointeur
global mutable — le slug est un argument, cf. l'abandon d'`out/data.js`). L'item porte l'état de
bout en bout, de `idée` à `publié`.

## Ce que Runner B lit et écrit

Runner B ne touche qu'à **un seul cran** : `programmé → publié`.

- **Dû** (réplique de `a_publier`) : `statut === "programmé"` **et** `post_at` (ISO 8601 **avec
  offset**) passé. Tri : `priorite` décroissant (ad hoc §8 d'abord), puis `post_at` croissant.
  Au plus **un item publié par run**.
- Après succès, il mute l'item **sur place** (comme `avancer_fichier`) : `statut → "publié"`,
  remplit `publication{media_id, permalink, published_at}`, et pousse une entrée dans
  `historique`. Le fichier ne bouge pas ; un item resté `programmé` n'a pas été posté.

## Champs consommés / écrits par Runner B

| Champ | Lu | Écrit | Rôle côté publisher |
|---|---|---|---|
| `slug` | ✓ | | Identité = nom du fichier `<slug>.json`. |
| `statut` | ✓ | ✓ | `programmé` → publie ; passe à `publié`. |
| `media.mp4_url` | ✓ | | URL publique du MP4 (asset GitHub Release). **Requis.** |
| `caption` | ✓ | | Légende Instagram, rédigée par le SMM. **Requis.** |
| `post_at` | ✓ | | Créneau, ISO 8601 **avec offset** (`+02:00`). Porte l'heure réelle. **Requis.** |
| `priorite` | ✓ | | Nombre ; `>0` = ad hoc, passe en tête. |
| `publication` | | ✓ | `{media_id, permalink, published_at}` posé après publication. |
| `historique` | | ✓ | Entrée `{statut:"publié", at}` ajoutée. |

Les autres champs (`pilier` 1–5, `format`, `type`, `media.duree_s`) sont éditoriaux : Runner B
ne s'en sert pas pour publier. Schéma complet et exemple : `stathisto/pipeline/README.md`.

## Fuseau horaire

`post_at` est en **ISO 8601 avec offset** (ex. `2026-09-05T18:00:00+02:00` = 18h Paris en été).
C'est le SMM qui pose l'offset ; Runner B compare simplement à `now()`. Le cron GitHub poll toutes
les 15 min → livraison dans la fenêtre `[post_at, post_at+~15 min]` (la dérive du cron rend une
livraison à la seconde illusoire).

## Où vit physiquement la file

Runner B tourne dans `histoviz-media` (GitHub Actions) et lit **son propre** `file/`. Le SMM
(Runner A, Mac/Cowork) écrit les items ici via `pipeline/etats.py` en passant ce dossier en
argument (`etats.ecrire("<checkout>/file", item)`). Même format des deux côtés, lecture
réimplémentée en JS côté publisher (aucune dépendance Python sur Actions).
