# -*- coding: utf-8 -*-
"""Pose la durée et l'URL du MP4 hébergé, et avance l'item `prêt → produit`.

    python3 .github/scripts/marquer_produit.py --file-dir DIR --slug S --duree 45.2 --url U

Refuse une durée hors de la fenêtre éditoriale 30-75 s : l'item reste `prêt`, à retravailler
par l'édito. Lancé depuis la racine du moteur.
"""
import argparse
import sys
from pathlib import Path

FENETRE = (30.0, 75.0)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--moteur", default=".")
    ap.add_argument("--file-dir", required=True)
    ap.add_argument("--slug", required=True)
    ap.add_argument("--duree", type=float, required=True)
    ap.add_argument("--url", required=True)
    ap.add_argument("--verifier", action="store_true",
                    help="ne contrôler que la durée, sans rien écrire")
    args = ap.parse_args(argv)

    if not FENETRE[0] <= args.duree <= FENETRE[1]:
        print(f"{args.slug} : durée {args.duree}s hors fenêtre {FENETRE[0]}-{FENETRE[1]}s — "
              "item laissé en « prêt », à retravailler par l'édito.", file=sys.stderr)
        return 2

    # Deux temps voulus : on contrôle la durée AVANT d'héberger (pas de Release pour une vidéo
    # hors fenêtre), et on n'écrit `mp4_url` dans l'item qu'APRÈS que la Release existe — sinon
    # un échec d'hébergement laisserait un item pointant une URL absente.
    if args.verifier:
        print(f"{args.slug} : durée {args.duree}s dans la fenêtre — hébergement autorisé")
        return 0

    sys.path.insert(0, str(Path(args.moteur).resolve()))
    from pipeline import etats

    etats.avancer_fichier(args.file_dir, args.slug,
                          **{"media.duree_s": args.duree, "media.mp4_url": args.url})
    print(f"{args.slug} → produit ({args.duree}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
