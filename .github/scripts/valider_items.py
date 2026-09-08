# -*- coding: utf-8 -*-
"""Valide des items de file passés en argument. Sort non nul au premier invalide.

Vit dans un fichier, pas dans un `run:` du workflow : du Python multi-lignes inséré dans un
bloc scalaire YAML casse le fichier de workflow (appris le 08/09/2026), et un script se teste
en local — ce qu'un heredoc dans un YAML ne permet pas.

    python3 .github/scripts/valider_items.py fichier.json [...]
"""
import json
import sys

REQUIS = ("slug", "statut")


def valider(chemin: str) -> list:
    try:
        with open(chemin, encoding="utf-8") as fh:
            item = json.load(fh)
    except (OSError, ValueError) as e:
        return [f"illisible : {e}"]
    if not isinstance(item, dict):
        return ["ce n'est pas un objet JSON"]
    return [f"champ « {c} » manquant" for c in REQUIS if not item.get(c)]


def main(chemins) -> int:
    faux = 0
    for c in chemins:
        erreurs = valider(c)
        if erreurs:
            faux += 1
            print(f"REFUS {c} : {'; '.join(erreurs)}", file=sys.stderr)
    if faux:
        print(f"{faux} item(s) invalide(s)", file=sys.stderr)
        return 1
    print(f"{len(chemins)} item(s) valides")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
