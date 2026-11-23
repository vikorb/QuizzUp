#!/usr/bin/env bash
# Met la production à jour vers une version étiquetée (tag git), avec retour arrière automatique.
#
#   ./update.sh v1.2.0           refuse s'il y a une partie en cours
#   ./update.sh v1.2.0 --force   passe outre (voir README : ce que cela coupe)
#
# Ordre : se placer sur le tag, construire les images (sans rien arrêter), sauvegarder, appliquer
# (migrations puis API), recharger Caddy, vérifier la santé. Au moindre échec : retour au code et à
# l'ancienne version, puis alerte.
#
# Tout est dans main() et l'appel est sur la dernière ligne : bash lit un script au fur et à mesure,
# or le `git checkout` ci-dessous remplace ce fichier pendant son exécution.
set -Eeuo pipefail

main() {
  cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1
  # shellcheck source=lib.sh
  . ./lib.sh
  require_env_file

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

  local migrated=0
  # shellcheck disable=SC2329 # appelée par trap ERR
  rollback() {
    trap - ERR
    echo "ÉCHEC de la mise à jour vers $target : retour à $previous." >&2
    alert "Mise à jour vers $target échouée, retour à $previous"
    git checkout --quiet --detach "$previous_ref"
    set_version "$previous"
    if dc up -d --build --remove-orphans &&
      { dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile || true; } && verify; then
      echo "Retour à $previous réussi." >&2
    else
      echo "Le retour à $previous a échoué aussi : intervention manuelle (README, « Si le serveur tombe »)." >&2
    fi
    if [ "$migrated" = 1 ]; then
      echo "Les migrations de $target ont été appliquées avant l'échec. Si $previous ne démarre pas sur" >&2
      echo "cette base, la restaurer : ./restore.sh (perd les données écrites depuis la sauvegarde)." >&2
    fi
    exit 1
  }
  trap rollback ERR

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

  trap - ERR
  echo "Mise à jour vers $target terminée. Images de l'ancienne version conservées pour un retour arrière."
}

main "$@"; exit $?
