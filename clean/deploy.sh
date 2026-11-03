#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "prod" ]]; then
   echo "Must specify environment (prod)"
   exit 1
fi

if [[ "${2:-}" != "confirm" && "${3:-}" != "confirm" && "${4:-}" != "confirm" ]]; then
   echo "Must add 'confirm' to deploy to prod"
   exit 1
fi

HOST="acprod"
TARGET_FOLDER="/root/vibey"
REBUILD=0
for arg in "$@"; do
   [[ "$arg" != "rebuild" ]] || REBUILD=1
done

cd "$(dirname "${BASH_SOURCE[0]}")"

ssh "$HOST" "mkdir -p '$TARGET_FOLDER'"
rsync -av --exclude node_modules --exclude .git ./ "$HOST:$TARGET_FOLDER/"

ssh "$HOST" "bash -s -- '$TARGET_FOLDER' '$REBUILD'" <<'REMOTE'
set -euo pipefail
cd "$1"

# Only change the remote configuration; keep local development settings intact.
node <<'NODE'
var fs = require ('fs');
var config = fs.readFileSync ('config.4tx', 'utf8');
if (! /^email enable [01][ \t]*$/m.test (config) || ! /^baseURL .+$/m.test (config)) {
   throw new Error ('Expected email enable and baseURL entries in config.4tx');
}
config = config.replace (/^email enable [01][ \t]*$/m, 'email enable 1');
config = config.replace (/^cloud 0$/m, 'cloud 1');
config = config.replace (/^baseURL .+$/m, 'baseURL https://app.buildwithvibey.com');
fs.writeFileSync ('config.4tx', config);
NODE

# Build the project image explicitly, even though its service has zero replicas.
docker compose build vibey-host vibey-project
if [[ "$2" == "1" ]]; then
   mapfile -t projects < <(docker ps -aq --filter 'name=^/vibey-project-')
   if (( ${#projects[@]} )); then
      docker stop "${projects[@]}"
      docker rm "${projects[@]}"
   fi
fi
docker compose up -d
REMOTE
