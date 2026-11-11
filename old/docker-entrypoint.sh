#!/bin/sh

# Seed secret.json into the app dir if it doesn't exist yet
if [ ! -f /app/secret.json ] && [ -f /app/seed/secret.json ]; then
  cp /app/seed/secret.json /app/secret.json
  echo "Seeded secret.json from build"
fi

REDIS_HOST_VALUE="$(node -e "try { var c=require('/app/secret.json'); process.stdout.write((c.redisHost || '127.0.0.1') + '') } catch (e) { process.stdout.write('127.0.0.1') }")"
REDIS_PORT_VALUE="$(node -e "try { var c=require('/app/secret.json'); process.stdout.write(((c.redisPort || 6379) + '')) } catch (e) { process.stdout.write('6379') }")"

# Start embedded redis only when configured to use localhost.
if [ "$REDIS_HOST_VALUE" = "127.0.0.1" ] || [ "$REDIS_HOST_VALUE" = "localhost" ]; then
  mkdir -p /app/data/redis
  redis-server \
    --bind 127.0.0.1 \
    --port "$REDIS_PORT_VALUE" \
    --dir /app/data/redis \
    --appendonly yes \
    --daemonize yes
  echo "Started embedded redis on $REDIS_HOST_VALUE:$REDIS_PORT_VALUE"
else
  echo "Using external redis at $REDIS_HOST_VALUE:$REDIS_PORT_VALUE"
fi

# Build sandbox image if it doesn't exist yet
if ! docker image inspect vibey-sandbox:latest >/dev/null 2>&1; then
  echo "Building sandbox image..."
  docker build -t vibey-sandbox:latest -f /app/Dockerfile.sandbox /app
  echo "Sandbox image ready"
fi

exec node server.js
