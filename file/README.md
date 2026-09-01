# file/

La file de publication (équivalent de `pipeline/file/` du Bloc 1). **Un item = un fichier
`<slug>.json`**, au format défini par le contrat `stathisto/pipeline/README.md`. Écrite par le
SMM (via `pipeline/etats.py`, dossier passé en argument), consommée par Runner B.

Runner B poste l'item `programmé` dû le plus prioritaire, puis avance `statut` à `publié`
**sur place** (il ne déplace rien). Un item resté `programmé` n'a pas été posté.

⚠️ Tout `<slug>.json` en `statut: programmé` avec `post_at` passé sera **réellement publié** au
prochain run. Ne pas déposer d'items de test ici.
