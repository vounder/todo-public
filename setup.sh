#!/usr/bin/env sh
set -eu
umask 077

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
command -v node >/dev/null || { echo "Node.js is required." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required." >&2; exit 1; }
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>22||(major===22&&minor>=13)?0:1)' ||
  { echo "Node.js 22.13 or newer is required." >&2; exit 1; }

(cd "$root/TodoApp" && npm ci)
(cd "$root/server" && npm ci)

if [ ! -f "$root/.env" ]; then
  server_port=${TODO_SERVER_PORT:-8080}
  database_name=${TODO_MONGO_DB_NAME:-todoapp}
  cors_origins=${TODO_CORS_ORIGINS:-}

  case "$server_port" in
    ''|*[!0-9]*) echo "Invalid application server port." >&2; exit 1 ;;
  esac
  [ "$server_port" -ge 1 ] && [ "$server_port" -le 65535 ] ||
    { echo "Invalid application server port." >&2; exit 1; }
  printf '%s' "$database_name" | grep -Eq '^[A-Za-z0-9_-]{1,63}$' ||
    { echo "Invalid database name." >&2; exit 1; }
  if [ -n "$cors_origins" ]; then
    printf '%s' "$cors_origins" |
      grep -Eq '^https?://[A-Za-z0-9._:-]+(,https?://[A-Za-z0-9._:-]+)*$' ||
      { echo "Invalid CORS origins." >&2; exit 1; }
  fi

  if ! (
    set -C
    {
      printf 'COMPOSE_PROJECT_NAME=todo-public-local\n'
      printf 'SERVER_BIND_ADDRESS=127.0.0.1\n'
      printf 'SERVER_HOST_PORT=%s\n' "$server_port"
      printf 'SERVER_CONTAINER_PORT=%s\n' "$server_port"
      printf 'MONGO_DB_NAME=%s\n' "$database_name"
      printf 'CORS_ORIGINS=%s\n' "$cors_origins"
    } > "$root/.env"
  ) 2>/dev/null; then
    echo ".env was created by another process; it was not changed."
  else
    echo "Created local .env (configuration values were not displayed)."
  fi
else
  echo ".env already exists; it was not changed."
fi

# DeployDesk's runner is Windows PowerShell. The shell setup creates its local
# link only when every target variable was deliberately supplied.
if [ ! -f "$root/todo-public.deploylink" ] &&
   [ -n "${TODO_DEPLOY_PROJECT_ID:-}" ] &&
   [ -n "${TODO_DEPLOY_HOST:-}" ] &&
   [ -n "${TODO_DEPLOY_USER:-}" ] &&
   [ -n "${TODO_DEPLOY_SSH_PORT:-}" ] &&
   [ -n "${TODO_DEPLOY_REMOTE_PATH:-}" ] &&
   [ -n "${TODO_DEPLOY_BRANCH:-}" ] &&
   [ -n "${TODO_DEPLOY_HEALTH_PORT:-}" ] &&
   [ -n "${TODO_DEPLOY_HEALTH_PATH:-}" ]; then
  (
    cd "$root"
    node -e 'const fs=require("fs");const e=process.env;const port=n=>{if(!/^\d{1,5}$/.test(e[n])||+e[n]<1||+e[n]>65535)throw Error("invalid "+n);return +e[n]};const ok=(n,r)=>{if(!r.test(e[n]))throw Error("invalid "+n);return e[n]};const remotePath=()=>{const v=ok("TODO_DEPLOY_REMOTE_PATH",/^\/[A-Za-z0-9._/-]+$/);if(v.length>1024||v.split("/").some(x=>x==="."||x===".."))throw Error("invalid TODO_DEPLOY_REMOTE_PATH");return v};const c={schemaVersion:2,project:{id:ok("TODO_DEPLOY_PROJECT_ID",/^[a-z0-9][a-z0-9_-]{1,63}$/),name:"Todo Public",description:"Locally configured deployment target.",accentColor:"#4F46E5"},repository:{remote:"origin",branch:ok("TODO_DEPLOY_BRANCH",/^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/)},server:{name:"Deployment environment",host:ok("TODO_DEPLOY_HOST",/^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/),user:ok("TODO_DEPLOY_USER",/^[A-Za-z_][A-Za-z0-9._-]{0,31}$/),sshPort:port("TODO_DEPLOY_SSH_PORT"),remotePath:remotePath(),healthCheck:{port:port("TODO_DEPLOY_HEALTH_PORT"),path:ok("TODO_DEPLOY_HEALTH_PATH",/^\/[A-Za-z0-9._~%/?=&-]{0,2047}$/),expectedStatus:200,attempts:20,intervalSeconds:2}},runner:{type:"powershell",file:"deploy/deploy.ps1",protocol:"deploydesk-jsonl-v1",arguments:[]},options:[],links:[]};fs.writeFileSync("todo-public.deploylink",JSON.stringify(c,null,2)+"\n",{encoding:"utf8",flag:"wx",mode:0o600});'
  )
  echo "Created local DeployDesk configuration."
else
  echo "DeployDesk configuration was not created; use setup.ps1 interactively or set all TODO_DEPLOY_* variables."
fi

echo 'Optional Android test APK: see "Android-APK bauen" in README.md.'
