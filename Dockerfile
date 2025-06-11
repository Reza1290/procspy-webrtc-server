FROM node:20 AS builder 

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --production --unsafe-perm

COPY src ./src
COPY tsconfig-build.json ./tsconfig-build.json
COPY tsconfig.json ./tsconfig.json

RUN npm run build


FROM node:20 AS production

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 1290
EXPOSE 50000-60000/udp

CMD ["node", "dist/server.js"]