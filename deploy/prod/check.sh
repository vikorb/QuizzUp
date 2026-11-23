#!/usr/bin/env bash
# Supervision légère, à lancer par une tâche planifiée (voir README) : services sains, API qui
# répond par le chemin public, certificats, espace disque, âge de la dernière sauvegarde.
# Affiche un bilan ; en cas de problème : une alerte par problème (webhook ou e-mail, voir
# lib.sh) et un code de sortie non nul.
#
# Seuils (variables d'environnement ou .env) : DISK_WARN_PERCENT (85), CERT_WARN_DAYS (14),
# BACKUP_MAX_AGE_HOURS (26).
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1
# shellcheck source=lib.sh
. ./lib.sh
require_env_file

disk_warn=$(env_get DISK_WARN_PERCENT 85)
cert_warn=$(env_get CERT_WARN_DAYS 14)
backup_max_h=$(env_get BACKUP_MAX_AGE_HOURS 26)
problems=()
problem_keys=()

# problem "message" clé : la clé (fixe : `disk`, `cert:<hôte>`…) sert à l'anti-répétition de alert ;
# le message, lui, contient des chiffres qui changent à chaque passage.
problem() {
  problems+=("$1")
  problem_keys+=("$2")
}

# 1. Services Docker : tous sains.
for service in postgres api caddy; do
  cid=$(dc ps -q "$service" 2> /dev/null)
  status=absent
  [ -n "$cid" ] && status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2> /dev/null || echo inconnu)
  if [ "$status" = healthy ]; then echo "OK    service $service"; else problem "service $service : $status" "service:$service"; fi
done

# 2. API : réponse par Caddy, comme un visiteur (--resolve : pas de dépendance au DNS de ce serveur).
api_host=$(env_get HOST_API)
body=$(curl -fsS -m 10 --resolve "$api_host:443:127.0.0.1" "https://$api_host/health" 2> /dev/null || true)
if [[ $body == *'"status":"ok"'* ]]; then echo "OK    API https://$api_host/health"; else problem "API ne répond pas sur https://$api_host/health" api; fi

# 3. Certificats : Caddy renouvelle 30 jours avant l'échéance ; sous le seuil, le renouvellement échoue.
for var in HOST_WWW HOST_APP HOST_SALLE HOST_API HOST_CONSOLE; do
  host=$(env_get "$var")
  end=$(echo | timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "$host" 2> /dev/null | openssl x509 -noout -enddate 2> /dev/null | cut -d= -f2)
  if [ -z "$end" ]; then problem "certificat illisible pour $host" "cert:$host"; continue; fi
  days=$(((($(date -d "$end" +%s)) - $(date +%s)) / 86400))
  if [ "$days" -ge "$cert_warn" ]; then echo "OK    certificat $host : $days jours"; else problem "certificat de $host : expire dans $days jours" "cert:$host"; fi
done

# 4. Disque : là où Docker range la base, les médias et les images.
docker_root=$(docker info -f '{{.DockerRootDir}}' 2> /dev/null || echo /var/lib/docker)
used=$(df --output=pcent "$docker_root" 2> /dev/null | tail -n 1 | tr -dc '0-9')
if [ -z "$used" ]; then
  problem "espace disque illisible ($docker_root)" disk
elif [ "$used" -lt "$disk_warn" ]; then
  echo "OK    disque $used %"
else
  problem "disque plein à $used % (seuil $disk_warn %)" disk
fi

# 5. Sauvegarde : le fichier est écrit par backup.sh à chaque succès.
marker="$STATE_DIR/last-backup-ok"
if [ ! -f "$marker" ]; then
  problem "aucune sauvegarde réussie enregistrée" backup
else
  age_h=$((($(date +%s) - $(stat -c %Y "$marker")) / 3600))
  if [ "$age_h" -le "$backup_max_h" ]; then echo "OK    dernière sauvegarde il y a $age_h h"; else problem "dernière sauvegarde réussie il y a $age_h h (seuil $backup_max_h h)" backup; fi
fi

if [ "${#problems[@]}" -eq 0 ]; then
  echo "Tout est en ordre."
  exit 0
fi
for i in "${!problems[@]}"; do
  alert "${problems[$i]}" "${problem_keys[$i]}"
done
exit 1
