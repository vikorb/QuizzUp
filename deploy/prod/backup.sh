#!/usr/bin/env bash
# Sauvegarde quotidienne : base PostgreSQL (format personnalisé de pg_dump) + volume des médias,
# chiffrées par restic AVANT de quitter la machine, envoyées vers le dépôt RESTIC_REPOSITORY.
#
#   ./backup.sh init   crée le dépôt distant (une seule fois, à l'installation)
#   ./backup.sh        sauvegarde, applique la rétention, vérifie le dépôt
#
# Code de sortie non nul au moindre échec, avec une alerte (voir lib.sh). Rétention par défaut :
# 7 jours, 4 semaines, 12 mois (KEEP_DAILY, KEEP_WEEKLY, KEEP_MONTHLY pour changer).
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1
# shellcheck source=lib.sh
. ./lib.sh
require_env_file
acquire_lock

restic() { dc run --rm -T restic "$@"; }

if [ "${1:-run}" = init ]; then
  restic init
  exit 0
fi
[ "${1:-run}" = run ] || die "usage : ./backup.sh [init]"

# Une copie de base en clair existe quelques secondes sur ce disque (le même que la base) : lisible
# par nous seuls, supprimée quoi qu'il arrive.
umask 077
dump=$(mktemp "$STATE_DIR/dump.XXXXXX")
cleanup() { rm -f "$dump"; }
trap cleanup EXIT
trap 'alert "Sauvegarde ÉCHOUÉE (ligne $LINENO) : voir la sortie du script"' ERR

keep_daily=$(env_get KEEP_DAILY 7)
keep_weekly=$(env_get KEEP_WEEKLY 4)
keep_monthly=$(env_get KEEP_MONTHLY 12)

echo "== Base de données"
# Le dump passe par un fichier plutôt que par un tube : si pg_dump échoue en route, restic n'est
# jamais lancé et aucun instantané tronqué ne devient « le dernier ». pg_restore --list relit
# le fichier et prouve qu'il est complet.
# shellcheck disable=SC2016 # $POSTGRES_* sont ceux du conteneur, pas de l'hôte
dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$dump"
dc exec -T postgres pg_restore --list < "$dump" > /dev/null
restic backup --stdin --stdin-filename db.pgdump --tag db < "$dump"

# Ordre : base d'abord, médias ensuite. Les fichiers sont écrits avant que la base ne les cite et
# ne changent jamais ; le seul écart possible est un extrait supprimé entre les deux, sans gravité.
echo "== Médias"
restic backup /media --tag media --exclude '*.tmp'

echo "== Rétention et vérification"
restic forget --prune --keep-daily "$keep_daily" --keep-weekly "$keep_weekly" --keep-monthly "$keep_monthly"
restic check

# Lu par check.sh pour détecter une sauvegarde qui ne tourne plus.
: > "$STATE_DIR/last-backup-ok"
echo "Sauvegarde terminée."
