# -*- coding: utf-8 -*-
"""Choisit la musique d'un sujet et muxe la vidéo muette — l'étape que le rendu ne fait pas.

`socle/capture.py` et `tools/render_local.cjs` produisent un MP4 **muet** : c'est le contrat
(README §« Où ça tourne »). La musique est une passe distincte — `socle/musique.py` choisit un
morceau dans l'ambiance du bundle, `socle/mux.py` produit le MP4 final. Séparées exprès :
changer de morceau ne coûte jamais un re-render.

Ce script existe parce que `render-host.yml` hébergeait le MP4 sorti du rendu, donc **muet** :
le reel « Iran vs Israel » est parti sans musique le 09/09/2026. On héberge désormais le final.

    python3 .github/scripts/muxer.py --moteur <racine> --slug <slug>

Écrit le chemin du MP4 final sur la sortie standard. Sort non nul si le mux échoue.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

AMBIANCE_DEFAUT = "temps-long"     # le repli de socle/musique.py


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--moteur", default=".")
    ap.add_argument("--slug", required=True)
    args = ap.parse_args(argv)

    racine = Path(args.moteur).resolve()
    bundle = racine / "filler" / "productions" / args.slug / "sujet.json"
    muet = racine / "filler" / "productions" / args.slug / "rendus" / f"{args.slug}.mp4"
    if not muet.is_file():
        print(f"{args.slug} : vidéo muette introuvable ({muet})", file=sys.stderr)
        return 1

    ambiance = AMBIANCE_DEFAUT
    if bundle.is_file():
        aff = json.loads(bundle.read_text(encoding="utf-8")).get("affichage") or {}
        ambiance = aff.get("ambiance") or AMBIANCE_DEFAUT

    choix = subprocess.run([sys.executable, "socle/musique.py", ambiance],
                           cwd=racine, capture_output=True, text=True)
    if choix.returncode != 0:
        print(f"{args.slug} : sélection musicale KO ({ambiance})\n{choix.stderr}", file=sys.stderr)
        return 1
    morceau = json.loads(choix.stdout)
    mp3 = morceau.get("chemin")

    final = racine / "filler" / "MP4 prêt à publier" / f"{args.slug}-final.mp4"
    final.parent.mkdir(parents=True, exist_ok=True)
    mux = subprocess.run([sys.executable, "socle/mux.py", str(muet), str(mp3), str(final)],
                         cwd=racine, capture_output=True, text=True)
    if mux.returncode != 0 or not final.is_file():
        print(f"{args.slug} : mux KO\n{mux.stdout}\n{mux.stderr}", file=sys.stderr)
        return 1

    # Contrôle : un MP4 sans piste audio signerait une régression silencieuse.
    pistes = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type",
         "-of", "csv=p=0", str(final)], capture_output=True, text=True)
    if "audio" not in pistes.stdout:
        print(f"{args.slug} : le MP4 final n'a pas de piste audio", file=sys.stderr)
        return 1

    print(f"{args.slug} : musique « {morceau.get('oeuvre')} » (ambiance {ambiance})",
          file=sys.stderr)
    print(final)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
