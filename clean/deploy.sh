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

HOST="root@136.243.174.166"
FOLDER="/root/vibey/clean"

cd "$(dirname "${BASH_SOURCE[0]}")"

ssh "$HOST" "mkdir -p '$FOLDER'"
rsync -av --exclude node_modules --exclude .git ./ "$HOST:$FOLDER/"

ssh "$HOST" "bash -s -- '$FOLDER'" <<'REMOTE'
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
config = config.replace (/^baseURL .+$/m, 'baseURL https://app.buildwithvibey.com');
fs.writeFileSync ('config.4tx', config);
NODE

# Build the project image explicitly, even though its service has zero replicas.
docker compose build vibey-host vibey-project
docker compose up -d
REMOTE
