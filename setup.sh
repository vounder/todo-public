#!/usr/bin/env sh
set -eu
umask 077
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"
mode=''; non_interactive=''; deploydesk=''; no_start=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --mode) [ "$#" -ge 2 ] || { echo '--mode benötigt einen Wert.' >&2; exit 1; }; mode=$2; shift ;;
    --non-interactive) non_interactive='yes' ;;
    --deploydesk) deploydesk='yes' ;;
    --no-start) no_start='yes' ;;
    *) echo "Unbekannte Option: $1" >&2; exit 1 ;;
  esac
  shift
done
if [ -z "$mode" ]; then
  if [ -n "$non_interactive" ]; then mode=server
  else
    printf 'Todo einrichten\n1. Android-App installieren\n2. Eigenen Server einrichten (Docker)\n3. Entwickeln (Node.js 24 LTS)\nAuswahl [1]: '
    read -r choice
    case "${choice:-1}" in 1) mode=app ;; 2) mode=server ;; 3) mode=developer ;; *) echo 'Bitte 1, 2 oder 3 auswählen.' >&2; exit 1 ;; esac
  fi
fi
if [ -n "$deploydesk" ] && [ "$mode" != server ]; then echo 'DeployDesk gehört zum Server-Setup: --mode server --deploydesk.' >&2; exit 1; fi
case "$mode" in
  app)
    printf 'APK: https://github.com/vounder/todo-public/releases/latest\nAuf Android öffnen und installieren. Danach lokal starten oder den Server-QR-Code scannen.\n'
    exit 0 ;;
  developer)
    command -v node >/dev/null || { echo 'Bitte Node.js 24 LTS installieren: https://nodejs.org/en/download' >&2; exit 1; }
    command -v npm >/dev/null || { echo 'npm fehlt.' >&2; exit 1; }
    [ "$(node -p 'process.versions.node.split(".")[0]')" = 24 ] || { echo 'Bitte Node.js 24 LTS verwenden.' >&2; exit 1; }
    (cd TodoApp && npm ci)
    (cd server && npm ci)
    printf 'Entwicklung bereit: cd TodoApp && npm start\nServer separat: ./setup.sh --mode server\n'
    exit 0 ;;
  server) ;;
  *) echo 'Modus muss app, server oder developer sein.' >&2; exit 1 ;;
esac
command -v docker >/dev/null || { echo 'Docker mit Compose fehlt. Siehe README.md.' >&2; exit 1; }
docker info --format '{{.ServerVersion}}'
docker compose version
env_file='.env.example'; [ ! -f .env ] || env_file='.env'
docker compose --env-file "$env_file" build server
if [ -z "${TODO_NETWORK_ADDRESSES:-}" ]; then
  if command -v hostname >/dev/null 2>&1; then TODO_NETWORK_ADDRESSES=$(hostname -I 2>/dev/null | tr ' ' ',' || true); fi
  if [ -z "${TODO_NETWORK_ADDRESSES:-}" ] && command -v ipconfig >/dev/null 2>&1; then TODO_NETWORK_ADDRESSES=$(ipconfig getifaddr en0 2>/dev/null || true); fi
fi
export TODO_NETWORK_ADDRESSES
set -- compose --env-file "$env_file" run --rm --no-deps -T --user "$(id -u):$(id -g)" --volume "$root:/workspace"
for name in TODO_NETWORK_ADDRESSES TODO_BIND_ADDRESS TODO_SERVER_PORT TODO_MONGO_DB_NAME TODO_PUBLIC_URL TODO_CORS_ORIGINS TODO_DEPLOY_HOST TODO_DEPLOY_USER TODO_DEPLOY_REMOTE_PATH TODO_DEPLOY_PROJECT_ID TODO_DEPLOY_BRANCH TODO_DEPLOY_SSH_PORT TODO_DEPLOY_HEALTH_PORT; do
  set -- "$@" --env "$name"
done
set -- "$@" server node setup/cli.js --root /workspace
[ -z "$non_interactive" ] || set -- "$@" --non-interactive
[ -z "$deploydesk" ] || set -- "$@" --deploydesk
docker "$@"
docker compose config --quiet
if [ -z "$no_start" ]; then
  docker compose up -d --wait --wait-timeout 120
  echo 'Server und Datenbank sind bereit.'
fi
printf 'Öffne setup-card.local.html und scanne den QR-Code in der App.\nStatus: docker compose ps\nProtokoll: docker compose logs --tail 50 server\nStoppen: docker compose down (Daten bleiben erhalten).\n'
