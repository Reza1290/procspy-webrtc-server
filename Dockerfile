FROM node:22-slim AS runner

# Needed for mediasoup postinstall
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/server.js"]
EXPOSE 3000
