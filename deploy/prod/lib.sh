#!/usr/bin/env bash
# Fonctions communes de backup.sh, restore.sh, update.sh et check.sh (à sourcer, pas à lancer).

DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENV_FILE="$DIR/.env"
STATE_DIR="${QUIZZUP_STATE_DIR:-$DIR/state}"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

die() {
  echo "ERREUR : $*" >&2
  exit 1
}

require_env_file() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE introuvable : cp .env.example .env, puis le remplir"
}

# acquire_lock : un seul verrou pour update.sh, backup.sh et restore.sh (check.sh n'en prend pas :
# il ne modifie rien). Une sauvegarde planifiée qui tomberait pendant une mise à jour verrouillerait
# le dépôt restic (`forget --prune`) et ferait échouer la mise à jour, donc déclencherait son retour
# arrière. Le verrou est tenu par le descripteur 9 jusqu'à la fin du script ; update.sh lance
# backup.sh en sous-processus : la variable QUIZZUP_LOCK_HELD lui évite de redemander le verrou.
# ponytail : verrou global à la machine, un seul de ces trois scripts à la fois.
acquire_lock() {
  [ -z "${QUIZZUP_LOCK_HELD:-}" ] || return 0
  command -v flock > /dev/null || die "flock introuvable (paquet util-linux)"
  exec 9> "$STATE_DIR/lock"
  flock -n 9 || die "une autre opération (mise à jour, sauvegarde ou restauration) est en cours : réessayer à sa fin"
  export QUIZZUP_LOCK_HELD=1
}

# docker compose sur cette pile, quel que soit le dossier d'où l'on lance le script.
dc() {
  docker compose --project-directory "$DIR" -f "$DIR/docker-compose.yml" --env-file "$ENV_FILE" "$@"
}

# env_get NOM [défaut] : la variable d'environnement, sinon la ligne de .env, sinon le défaut.
# .env n'est jamais « sourcé » : ses valeurs peuvent contenir des espaces (listes de plages réseau).
env_get() {
  local name=$1 default=${2:-} value=${!1:-}
  if [ -z "$value" ] && [ -f "$ENV_FILE" ]; then
    value=$(grep -E "^${name}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '\r' || true)
    value=${value#\"}
    value=${value%\"}
  fi
  echo "${value:-$default}"
}

# sql "requête" : exécute du SQL dans la base de production et affiche le résultat brut.
sql() {
  # shellcheck disable=SC2016 # variables du conteneur, pas de l'hôte
  printf '%s\n' "$1" | dc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1'
}

# alert "message" [clé] : webhook et/ou e-mail (ALERT_WEBHOOK_URL, ALERT_EMAIL_TO). La même alerte
# n'est renvoyée qu'après ALERT_REPEAT_MINUTES (60 par défaut) : une tâche planifiée toutes les 5
# minutes ne doit pas inonder la messagerie. « Même alerte » = même clé ; sans clé, le message lui-
# même. Un message qui contient des chiffres variables (%, jours, heures) doit donc passer une clé
# fixe, sinon chaque texte différent repart. Sans canal configuré, le message va seulement sur stderr.
alert() {
  local message=$1 webhook email repeat stamp text sent=1 configured=0
  webhook=$(env_get ALERT_WEBHOOK_URL)
  email=$(env_get ALERT_EMAIL_TO)
  repeat=$(env_get ALERT_REPEAT_MINUTES 60)
  stamp="$STATE_DIR/alert.$(printf '%s' "${2:-$message}" | cksum | cut -d' ' -f1)"

  echo "ALERTE : $message" >&2
  if [ -f "$stamp" ] && [ -n "$(find "$stamp" -mmin "-$repeat")" ]; then
    return 0
  fi

  text="[quizzup] $(hostname) : ${message//[\"\\]/ }"
  if [ -n "$webhook" ]; then
    configured=1
    # `text` pour Slack et Mattermost, `content` pour Discord.
    if curl -fsS -m 15 -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"$text\",\"content\":\"$text\"}" "$webhook" > /dev/null; then sent=0; fi
  fi
  if [ -n "$email" ] && command -v mail > /dev/null; then
    configured=1
    if printf '%s\n' "$text" | mail -s "[quizzup] alerte" "$email"; then sent=0; fi
  fi

  # Aucun canal n'a abouti : on ne mémorise pas, le prochain passage réessaie.
  if [ "$configured" = 0 ] || [ "$sent" = 0 ]; then
    : > "$stamp"
  fi
  return 0
}
