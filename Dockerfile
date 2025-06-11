# Stage 1: Build
FROM ubuntu:22.04 AS builder

# Install Node.js
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs

RUN apt-get install -y \
    python3 python3-pip \
    build-essential \
    && ln -sf /usr/bin/gcc /usr/bin/cc \
    && ln -sf /usr/bin/g++ /usr/bin/c++

WORKDIR /app

COPY package*.json ./
COPY . .                      
RUN npm install
RUN npm run build

# Stage 2: Runtime
FROM ubuntu:22.04 AS runner

RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

CMD ["node", "dist/main.js"]  
