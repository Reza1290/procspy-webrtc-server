FROM node:22

WORKDIR /app

COPY package*.json ./

RUN apt-get update && \
    apt-get install -y python3 python3-pip build-essential && \
    apt-get clean

RUN npm install

COPY . .

RUN npm run build

CMD ["node", "dist/server.js"]
