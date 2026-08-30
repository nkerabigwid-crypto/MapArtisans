#!/usr/bin/env bash
#
# Compare schema.prisma a la VRAIE base. A lancer sur le serveur, apres chaque
# migration :  ./db/verifier-schema.sh
#
# POURQUOI CE CONTROLE EXISTE
#
# `schema.prisma` sert de reference au modele, mais rien ne le force a rester
# synchronise avec les migrations SQL ecrites a la main. La derive est
# silencieuse et se paie tard : le 30 aout 2026, `users.phone_number` etait
# NOT NULL en base alors que tout le code traitait l'absence de mobile comme
# normale — AUCUNE inscription n'aurait fonctionne, et rien ne le signalait
# avant d'ecrire en base pour de vrai.
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTENEUR="${PG_CONTENEUR:-mapartisans-postgres-1}"
BASE="${POSTGRES_DB:-mapartisans}"
UTILISATEUR="${POSTGRES_USER:-mapartisans}"

docker exec -i "$CONTENEUR" psql -U "$UTILISATEUR" -d "$BASE" -tAc \
  "select table_name||'.'||column_name||'|'||is_nullable
   from information_schema.columns where table_schema='public' order by 1;" \
  > /tmp/schema_reel.txt

python3 - "$RACINE/frontend/prisma/schema.prisma" <<'PY'
import io, re, sys

reel = {}
for l in io.open('/tmp/schema_reel.txt'):
    l = l.strip()
    if '|' not in l:
        continue
    col, nul = l.rsplit('|', 1)
    reel[col] = (nul == 'NO')   # True = NOT NULL

src = io.open(sys.argv[1], encoding='utf-8').read()
manquants, nullabilite = [], []
scalaires = {'String','Int','Boolean','DateTime','Decimal','Json','BigInt','Float','Bytes'}

for bloc in re.findall(r'model \w+ \{(.*?)\n\}', src, re.S):
    m = re.search(r'@@map\("(\w+)"\)', bloc)
    if not m:
        continue
    table = m.group(1)
    for ligne in bloc.split('\n'):
        l = ligne.strip()
        if not l or l.startswith(('//', '@@', '///')):
            continue
        mm = re.match(r'(\w+)\s+(\w+)(\[\])?(\?)?', l)
        if not mm:
            continue
        champ, typ, liste, opt = mm.groups()
        if liste:                       # relation « plusieurs »
            continue
        mc = re.search(r'@map\("(\w+)"\)', l)
        col = f"{table}.{mc.group(1) if mc else champ}"
        if col not in reel:
            if typ in scalaires:        # une relation nommee n'a pas de colonne
                manquants.append(col)
            continue
        if (opt is None) != reel[col]:
            manquants_txt = 'requis' if opt is None else 'optionnel'
            base_txt = 'NOT NULL' if reel[col] else 'nullable'
            nullabilite.append(f"  {col:<40} Prisma:{manquants_txt:<10} base:{base_txt}")

print(f"{len(reel)} colonnes en base comparees a schema.prisma")
souci = False
if manquants:
    souci = True
    print("\nCOLONNES DECLAREES DANS PRISMA, ABSENTES EN BASE :")
    print('\n'.join('  ' + c for c in manquants))
if nullabilite:
    souci = True
    print("\nDESACCORDS DE NULLABILITE :")
    print('\n'.join(nullabilite))
if not souci:
    print("Aucun ecart.")
sys.exit(1 if souci else 0)
PY
