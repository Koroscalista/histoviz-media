# histoviz-media

Deux rôles dans un seul repo public HistoViz :

1. **Hébergement des MP4** — les vidéos finies sont poussées en **assets de GitHub Release**, ce qui
   donne une URL publique consommée par l'API Instagram Graph. 0 €.
2. **Publisher (Runner B)** — le service de **publication Instagram always-on** : un cron GitHub
   Actions lit une file d'items prêts et poste des Reels. Il **exécute des posts déjà préparés** :
   aucun raisonnement, aucun LLM. La production des items (captions, créneaux) est faite en amont
   par le **SMM** (Runner A), hors de ce repo.

Cadrage : `HistoViz/docs/publication-auto.md` (§4 Publisher, §5 Runner B). Identifiants Meta :
`HistoViz/docs/setup-meta.md`.

## Le publisher — ce que ça fait

| Workflow | Cron | Rôle |
|---|---|---|
| `publish` | `*/15 * * * *` | Lit `file/`, prend l'item **dû** le plus prioritaire (`statut: programmé`, `post_at ≤ now`), crée un conteneur Reel, attend l'encodage, `media_publish`, avance l'item `programmé → publié` sur place. **≤ 1 post/run.** |
| `refresh-token` | `0 4 * * 1` (hebdo) | Échange le token longue durée contre un frais (~60 j) et **réécrit le secret** `IG_ACCESS_TOKEN`. |

La file est le dossier `file/`, au **format Bloc 1** (`stathisto/pipeline/README.md` fait foi).
Rappel côté publisher : [`docs/FORMAT.md`](docs/FORMAT.md).
L'`IG business user id` (non secret) est dans `config.json`.

## Secrets à configurer (une fois)

| Nom | Type | Contenu |
|---|---|---|
| `IG_ACCESS_TOKEN` | secret | Token Instagram longue durée (60 j). **Collé par Alexis**, jamais dans le repo/chat. |
| `GH_PAT_SECRETS` | secret | PAT fine-grained, repo `histoviz-media`, permission **Secrets: Read and write**. Permet au job de refresh de réécrire `IG_ACCESS_TOKEN`. |

```bash
gh secret set IG_ACCESS_TOKEN --repo Koroscalista/histoviz-media   # colle le token au prompt
gh secret set GH_PAT_SECRETS  --repo Koroscalista/histoviz-media   # colle le PAT au prompt
```

## Test local (sans rien publier)

```bash
IG_ACCESS_TOKEN=xxx node src/publish.mjs --dry-run
```

Pour un vrai test de bout en bout : poser un item `statut: programmé` dans `file/` avec `post_at`
passé, puis lancer le workflow `publish` en `workflow_dispatch`.

## Garanties

- **Zéro dépendance** : Node 20+ natif (`fetch`), rien à `npm install`.
- **Pas de double post** : dès qu'un item est posté, son `statut` passe à `publié` et il sort du
  périmètre `a_publier` ; `concurrency` empêche deux runs simultanés. File vide → cron au vert
  sans même lire le token.
- **0 €/mois** : Actions, hébergement Release, API en mode dév.
