# -*- coding: utf-8 -*-
"""Dit quels slugs render-host doit traiter, l'actu d'abord.

    python3 .github/scripts/file_selection.py [--slug UN_SLUG]

Écrit deux lignes `cle=valeur` sur la sortie standard, à rediriger vers $GITHUB_OUTPUT.
Doit être lancé depuis la racine du moteur (il importe `pipeline.etats`).
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[0]))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--moteur", default=".", help="racine du moteur (défaut : cwd)")
    ap.add_argument("--slug", default=None, help="ne traiter que ce slug")
    args = ap.parse_args(argv)

    sys.path.insert(0, str(Path(args.moteur).resolve()))
    from pipeline import etats

    file_dir = etats.dossier_file(strict=True)
    if args.slug:
        slugs = [args.slug]
    else:
        # L'actu passe devant : sa fenêtre se referme, l'evergreen attend.
        rapides = [i["slug"] for i in etats.voie_rapide(file_dir) if i.get("statut") == "prêt"]
        autres = [i["slug"] for i in etats.lister(file_dir)
                  if i.get("statut") == "prêt" and etats.est_actif(i) and i["slug"] not in rapides]
        slugs = rapides + autres
    print(f"file_dir={file_dir}")
    print(f"slugs={json.dumps(slugs)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
