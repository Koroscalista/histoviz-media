# Format de la file — « Bloc 1 »

La file de publication est le dossier **`queue/`** du repo. **Un item = un fichier `<id>.json`.**
C'est le seul contrat entre le producteur (SMM / Runner A) et le publisher (Runner B). Runner B
**consomme** ce format, il ne le génère jamais.

Le SMM écrit les items ; Runner B les lit, poste le plus ancien qui est dû, puis déplace le fichier
dans `published/` en y ajoutant le résultat. L'historique git tient lieu de journal d'audit.

## Schéma d'un item

```json
{
  "id": "2026-09-05-age-we-die-uk",
  "slug": "age-we-die-uk",
  "format": "signature",
  "pilier": "esperance-de-vie",
  "media_type": "REELS",
  "media_url": "https://github.com/Koroscalista/histoviz-media/releases/download/<tag>/<fichier>.mp4",
  "caption": "Accroche…\n\nWatch…\n\n📊 …\n\nSource: Our World in Data\n\n🔔 …\n\n#history #data …",
  "share_to_feed": true,
  "publish_at": "2026-09-05T15:00:00Z",
  "priority": false
}
```

### Champs

| Champ | Requis | Rôle |
|---|---|---|
| `id` | oui | Identifiant unique = **nom du fichier** (`<id>.json`). Convention `YYYY-MM-DD-slug`. |
| `slug` | reco | Slug de la production (traçabilité vers le moteur). |
| `format` | reco | `signature` ou `filler` (info éditoriale, non utilisée pour publier). |
| `pilier` | reco | Pilier éditorial (audit / rotation). |
| `media_type` | non | `REELS` par défaut. Seul type géré en v1. |
| `media_url` | **oui** | URL **publique** du MP4 (asset d'un GitHub Release de `histoviz-media`). |
| `caption` | **oui** | Légende Instagram complète, déjà rédigée par le SMM. |
| `share_to_feed` | non | `true` par défaut (le Reel apparaît aussi au feed). `false` pour Reel seul. |
| `publish_at` | **oui** | Date/heure de publication en **UTC ISO 8601** (`…Z`). Porte le créneau réel. |
| `priority` | non | `true` = demande ad hoc, passe devant à cadence égale (§8 de l'archi). |

### Fuseau horaire — important

`publish_at` est **toujours en UTC**. C'est au producteur (SMM) de convertir « 17h Paris » :
- Été (CEST, UTC+2) → `15:00:00Z`
- Hiver (CET, UTC+1) → `16:00:00Z`

Runner B compare simplement `publish_at` à `now()` UTC. Le cron poll toutes les 15 min : un item
programmé à 15:00Z part au premier run suivant, soit ~15:00–15:15Z. La dérive du cron GitHub
(5–15 min) rend une livraison à la seconde illusoire — viser une **fenêtre**, pas un instant.

## Ce que Runner B écrit dans `published/<id>.json`

Les champs d'origine, plus :

```json
{
  "status": "published",
  "published_at": "2026-09-05T15:03:12Z",
  "ig_media_id": "17912345678901234",
  "ig_permalink": "https://www.instagram.com/reel/…"
}
```

## Règles de consommation (Runner B)

- **Dû** = `status` absent ou `"scheduled"` **et** `publish_at ≤ now`.
- Ordre : `priority` d'abord, puis `publish_at` le plus ancien.
- **Au plus un item publié par run** (sécurité + limite API 50/24 h jamais approchée).
- Après succès : l'item quitte `queue/` pour `published/`. Un item resté dans `queue/` n'a pas
  (encore) été posté.
