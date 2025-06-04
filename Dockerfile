# Stage 1: Build
FROM node:22-slim AS builder

# Install system dependencies only when needed
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the app
COPY . .

# Build the app
RUN npm run build

# Stage 2: Runtime (lean production)
FROM node:22-slim AS runner

WORKDIR /app

# Copy only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output and other necessary files
COPY --from=builder /app/dist ./dist

# Start the server
CMD ["node", "dist/server.js"]

# Expose port (optional, documentational)
EXPOSE 3000
