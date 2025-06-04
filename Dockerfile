# Stage 1: Build
FROM node:22-slim AS builder

# Install dependencies and build tools
RUN apt-get update && \
    apt-get install -y python3 python3-pip build-essential && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:22-slim AS runner

WORKDIR /app

# Only copy what's needed for runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

CMD ["node", "dist/server.js"]
EXPOSE 3000
