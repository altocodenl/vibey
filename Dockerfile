# Vibey master container
FROM node:22-alpine

# Install docker-cli only (not the daemon)
RUN apk add --no-cache docker-cli bash

WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install --production

# Copy application files
COPY server.js client.js test-client.js test-server.js prompt.md ./

# Bake secret.json into image as seed if present (API keys etc.)
RUN mkdir -p /app/seed /app/projects && echo '{}' > /app/seed/secret.json
COPY secret.json* /app/seed/

# Entrypoint seeds config into volume on first run, then starts node
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/app/docker-entrypoint.sh"]
