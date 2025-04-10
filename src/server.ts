import express from 'express'
import https from 'https'
import fs from 'fs'
import { Server as SocketIOServer } from 'socket.io'
import path from 'path'
import indexRoutes from './routes/index-routes'
import { handleSocketConnection } from './sockets/mediasoup-handler'

const PORT = 443 

const sslOptions = {
  key: fs.readFileSync(__dirname + '/cert/key.pem'),
  cert: fs.readFileSync(__dirname+ '/cert/cert.pem'),
}

const app = express()

// routes here
indexRoutes(app)

const server = https.createServer(sslOptions, app)

server.listen(PORT, () => {
  console.log(`Server running securely on https://localhost:${PORT}`)
})

const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
  },
})

io.of('/mediasoup').on('connection', handleSocketConnection)
