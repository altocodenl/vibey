#!/bin/sh
set -e

REPO="https://raw.githubusercontent.com/altocodenl/vibey/main"
DIR="./vibey"

FILES="
docker-compose.yml
Dockerfile
Dockerfile.sandbox
docker-entrypoint.sh
package.json
server.js
client.js
client-css.js
prompt.md
"

echo "Installing vibey into $DIR..."

if command -v curl >/dev/null 2>&1; then
   DOWNLOAD_TOOL="curl"
elif command -v wget >/dev/null 2>&1; then
   DOWNLOAD_TOOL="wget"
else
   echo "Error: either curl or wget is required." >&2
   exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
   echo "Error: Docker is required." >&2
   exit 1
fi

mkdir -p "$DIR"

for file in $FILES; do
   echo "  Downloading $file"
   if [ "$DOWNLOAD_TOOL" = "curl" ]; then
      curl -fsSL "$REPO/$file" -o "$DIR/$file"
   else
      wget -q "$REPO/$file" -O "$DIR/$file"
   fi
done

chmod +x "$DIR/docker-entrypoint.sh"

echo ""
echo "Done! To start vibey:"
echo ""
echo "  cd vibey"
echo "  docker compose up --build"
echo ""
echo "Then open http://localhost:5353"
