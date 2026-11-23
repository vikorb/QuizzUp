#!/usr/bin/env bash
# Restaure la dernière sauvegarde (base + médias) dans une pile VIDE.
#
#   ./restore.sh --yes               restaure puis démarre toute la pile
#   ./restore.sh --yes --no-start    restaure seulement (essai de restauration, voir README)
#
# Variables : SNAPSHOT_DB et SNAPSHOT_MEDIA (identifiant d'instantané restic, `latest` par défaut).
# Refuse de toucher une base qui contient déjà des tables : pour repartir de zéro, `docker compose
# down -v` d'abord (efface la base ET les médias de cette pile).
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1
# shellcheck source=lib.sh
. ./lib.sh
require_env_file

confirmed=0
start=1
for arg in "$@"; do
  case "$arg" in
    --yes) confirmed=1 ;;
    --no-start) start=0 ;;
    *) die "option inconnue : $arg (usage : ./restore.sh --yes [--no-start])" ;;
  esac
done
[ "$confirmed" = 1 ] || die "restaure la sauvegarde dans une pile vide. Relancer avec --yes pour confirmer."

restic() { dc run --rm -T restic "$@"; }
restic_root() { dc run --rm -T restic-restore "$@"; }

echo "== Base PostgreSQL démarrée"
dc up -d --wait postgres

tables=$(sql "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
[ "$tables" = 0 ] || die "la base contient déjà $tables table(s) : pile non vide (docker compose down -v pour repartir de zéro)"

echo "== Restauration de la base (${SNAPSHOT_DB:-latest})"
# shellcheck disable=SC2016 # variables du conteneur, pas de l'hôte
restic dump --tag db "${SNAPSHOT_DB:-latest}" /db.pgdump |
  dc exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error'

echo "== Restauration des médias (${SNAPSHOT_MEDIA:-latest})"
restic_root restore --tag media "${SNAPSHOT_MEDIA:-latest}" --target /
# 1000 = utilisateur `node` de l'image api (Dockerfile.api) : seul lui écrit dans ce volume.
dc run --rm -T --entrypoint chown restic-restore -R 1000:1000 /media

echo "== Contrôle"
for table in admins companies questions games; do
  echo "$table : $(sql "SELECT count(*) FROM $table")"
done
echo "fichiers médias : $(dc run --rm -T --entrypoint sh restic-restore -c 'find /media -type f | wc -l')"

if [ "$start" = 1 ]; then
  echo "== Démarrage de la pile"
  dc up -d --wait
fi
echo "Restauration terminée."
