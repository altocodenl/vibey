#!/bin/sh
# Seed secret.json into the app dir if it doesn't exist yet
if [ ! -f /app/secret.json ] && [ -f /app/seed/secret.json ]; then
  cp /app/seed/secret.json /app/secret.json
  echo "Seeded secret.json from build"
fi

# Build sandbox image if it doesn't exist yet
if ! docker image inspect vibey-sandbox:latest >/dev/null 2>&1; then
  echo "Building sandbox image..."
  docker build -t vibey-sandbox:latest -f /app/Dockerfile.sandbox /app
  echo "Sandbox image ready"
fi

exec node server.js
