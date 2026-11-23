#!/usr/bin/env bash
# Met la production à jour vers une version étiquetée (tag git), avec retour arrière automatique.
#
#   ./update.sh v1.2.0           refuse s'il y a une partie en cours
#   ./update.sh v1.2.0 --force   passe outre (voir README : ce que cela coupe)
#
# Ordre : refuser si la base contient des migrations que le tag ne connaît pas, se placer sur le
# tag, construire les images (sans rien arrêter), sauvegarder, appliquer (migrations puis API),
# recharger Caddy, vérifier la santé. Au moindre échec (ou si la session est coupée : HUP, INT,
# TERM) : annulation des migrations ajoutées, puis retour au code et à l'ancienne version, puis
# alerte. Si l'annulation des migrations échoue, le script s'arrête sans rien toucher d'autre.
#
# Tout est dans main() et l'appel est sur la dernière ligne : bash lit un script au fur et à mesure,
# or le `git checkout` ci-dessous remplace ce fichier pendant son exécution.
set -Eeuo pipefail

main() {
  cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1
  # shellcheck source=lib.sh
  . ./lib.sh
  require_env_file
  acquire_lock

  local target=${1:-} force=0
  [ "${2:-}" = --force ] && force=1
  [[ $target =~ ^v[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.]+)?$ ]] ||
    die "usage : ./update.sh vX.Y.Z [--force]"

  local previous previous_ref api_host
  previous=$(env_get QUIZZUP_VERSION)
  api_host=$(env_get HOST_API)
  [ -n "$api_host" ] || die "HOST_API manquant dans .env"
  previous_ref=$(git rev-parse HEAD)
  [ -z "$(git status --porcelain --untracked-files=no)" ] ||
    die "des fichiers suivis par git sont modifiés : les valider ou les annuler avant de mettre à jour"

  git fetch --tags --quiet origin
  git rev-parse -q --verify "refs/tags/$target" > /dev/null || die "tag $target introuvable"

  local running
  running=$(sql "SELECT count(*) FROM games WHERE state = 'running' AND status <> 2")
  if [ "$running" != 0 ] && [ "$force" = 0 ]; then
    die "$running partie(s) en cours. Attendre leur fin, ou relancer avec --force (voir README)."
  fi

  # Migrations Knex. knex refuse de travailler si la base en contient une que le code ne connaît pas
  # (« migration directory is corrupt »), donc :
  #  - une cible plus ancienne que la base est refusée tout de suite, avant de toucher à rien ;
  #  - le numéro de lot est relevé maintenant : s'il a augmenté au moment d'un échec, c'est que la
  #    cible a migré, et ses migrations doivent être annulées (avec SON image, qui contient leurs
  #    `down`) avant de remettre l'ancien code. Si le lot n'a pas bougé, on n'annule RIEN : on
  #    défairait les migrations de la version précédente.
  local applied known unknown batch_before
  applied=$(sql "SELECT name FROM knex_migrations") || die "lecture de knex_migrations impossible"
  batch_before=$(sql "SELECT coalesce(max(batch), 0) FROM knex_migrations") || die "lecture de knex_migrations impossible"
  [[ $batch_before =~ ^[0-9]+$ ]] || die "numéro de lot des migrations illisible ($batch_before)"
  known=$(git ls-tree -r --full-tree --name-only "refs/tags/$target" backoffice/backend/db/migrations/ | sed 's|.*/||')
  unknown=$(LC_ALL=C comm -23 <(printf '%s\n' "$applied" | LC_ALL=C sort) <(printf '%s\n' "$known" | LC_ALL=C sort))
  [ -z "$unknown" ] || die "la base contient des migrations que $target ne connaît pas :
$unknown
Passer à une version plus ancienne n'est pas automatique : voir README, « Retour arrière »."

  set_version() {
    if grep -q '^QUIZZUP_VERSION=' "$ENV_FILE"; then
      sed -i "s|^QUIZZUP_VERSION=.*|QUIZZUP_VERSION=$1|" "$ENV_FILE"
    else
      echo "QUIZZUP_VERSION=$1" >> "$ENV_FILE"
    fi
  }

  # Attend que l'API et Caddy se déclarent sains, puis teste le chemin public complet (DNS non
  # utilisé : --resolve vise le Caddy de cette machine).
  verify() {
    local service status body
    for service in api caddy; do
      for _ in $(seq 1 60); do
        status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$(dc ps -q "$service")" 2> /dev/null || true)
        [ "$status" = healthy ] && break
        sleep 2
      done
      [ "$status" = healthy ] || { echo "$service n'est pas sain ($status)" >&2; return 1; }
    done
    body=$(curl -fsS -m 10 --resolve "$api_host:443:127.0.0.1" "https://$api_host/health") || return 1
    [[ $body == *'"status":"ok"'* ]]
  }

  # Annule le dernier lot de migrations si la cible en a appliqué un. Code de sortie non nul : état
  # impossible à lire ou à annuler, on ne devine pas.
  undo_migrations() {
    local batch_now
    batch_now=$(sql "SELECT coalesce(max(batch), 0) FROM knex_migrations") || return 1
    [[ $batch_now =~ ^[0-9]+$ ]] || return 1
    [ "$batch_now" -eq "$batch_before" ] && return 0
    # Un seul `migrate:latest` a tourné : un seul lot de plus. Autre chose = état inattendu.
    [ "$batch_now" -eq $((batch_before + 1)) ] || return 1
    echo "Annulation des migrations de $target (lot $batch_now)." >&2
    # L'API de la cible ne doit plus toucher la base pendant que ses colonnes disparaissent.
    dc stop api || true
    dc run --rm --no-deps -T migrate node_modules/.bin/knex migrate:rollback
  }

  local migrated=0
  # shellcheck disable=SC2329 # appelée par trap ERR HUP INT TERM
  rollback() {
    # Plus d'interception (un second signal ne doit pas interrompre le retour arrière) ; set +e : les
    # étapes sont enchaînées à la main, un échec ne doit pas faire sortir avant l'alerte.
    trap - ERR
    trap '' HUP INT TERM
    set +e
    echo "ÉCHEC de la mise à jour vers $target : retour à $previous." >&2
    alert "Mise à jour vers $target échouée, retour à $previous"
    if [ "$migrated" = 1 ] && ! undo_migrations; then
      echo "Les migrations de $target n'ont pas pu être annulées automatiquement. Rien d'autre n'a été" >&2
      echo "modifié : le code, .env et les conteneurs restent sur $target. Procédure manuelle : README," >&2
      echo "« Retour arrière »." >&2
      alert "Mise à jour vers $target : migrations NON annulées, intervention manuelle (README, Retour arrière)"
      exit 1
    fi
    # Sans --build : les images de l'ancienne version existent déjà, les reconstruire prendrait des
    # minutes et pourrait tirer une autre `node:22-alpine`.
    if git checkout --quiet --detach "$previous_ref" && set_version "$previous" &&
      dc up -d --remove-orphans &&
      { dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile || true; } && verify; then
      echo "Retour à $previous réussi." >&2
    else
      echo "Le retour à $previous a échoué aussi : intervention manuelle (README, « Si le serveur tombe »)." >&2
      alert "Retour à $previous ÉCHOUÉ après l'échec de la mise à jour vers $target : intervention manuelle"
    fi
    exit 1
  }
  # HUP, INT, TERM : une session SSH qui tombe pendant `dc build` laisserait sinon le dépôt et .env
  # sur la cible alors que les conteneurs sont ceux d'avant.
  trap rollback ERR HUP INT TERM

  echo "== Passage sur $target (depuis $previous)"
  git checkout --quiet --detach "refs/tags/$target"
  set_version "$target"

  echo "== Construction des images (rien n'est arrêté)"
  dc build

  echo "== Sauvegarde avant migration"
  bash ./backup.sh

  echo "== Application (migrations, API, fichiers statiques)"
  migrated=1
  dc up -d --remove-orphans
  # Le Caddyfile est monté, pas copié : un `up` ne voit pas qu'il a changé.
  dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile

  echo "== Vérification"
  verify

  trap - ERR HUP INT TERM
  echo "Mise à jour vers $target terminée. Images de l'ancienne version conservées pour un retour arrière."
}

main "$@"; exit $?
