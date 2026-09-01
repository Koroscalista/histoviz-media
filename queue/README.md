# queue/

La file de publication. **Un item prêt = un fichier `<id>.json`** déposé ici par le SMM.
Runner B poste le plus ancien qui est dû, puis déplace le fichier dans `../published/`.

Format complet : [`../docs/FORMAT.md`](../docs/FORMAT.md). Ne pas mettre d'items de test ici :
tout `*.json` dont `publish_at` est passé sera **réellement publié** au prochain run.
