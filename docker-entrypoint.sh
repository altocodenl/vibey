#!/bin/sh
# Seed secret.json into the app dir if it doesn't exist yet
if [ ! -f /app/secret.json ] && [ -f /app/seed/secret.json ]; then
  cp /app/seed/secret.json /app/secret.json
  echo "Seeded secret.json from build"
fi

exec node server.js
