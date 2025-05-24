import express from 'express'
import https from 'https'
import fs from 'fs'
import { Server as SocketIOServer } from 'socket.io'
import path from 'path'
import indexRoutes from './routes/index-routes'
import { handleSocketConnection } from './sockets/mediasoup-handler'
import { env } from 'process'

const PORT = 443

const sslOptions = {
  //TODO: FIX DIRECTORY
  key: fs.readFileSync('./cert/key.pem'),
  cert: fs.readFileSync('./cert/cert.pem'),
  rejectUnauthorized: false
}

const app = express()

// routes here
indexRoutes(app)

const server = https.createServer(sslOptions, app)

server.listen(PORT, () => {
  console.log(`Server running securely on https://localhost:${PORT}`)
})

const io = new SocketIOServer(server, {
  maxHttpBufferSize: 1e9,
  cors: {
    origin: '*',
  },
})

// io.of('/mediasoup').use(async (socket, next) => {
//   const token = socket.handshake.auth?.token;

//   if (!token) {
//     return next(new Error('Authentication token missing'));
//   }

//   const isValid = await verifyToken(token);

//   if (!isValid) {
//     return next(new Error('Invalid token'));
//   }

//   next();
// });
io.of('/mediasoup').on('connection', handleSocketConnection)


const verifyToken = async (token: string): Promise<boolean> => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    const response = await fetch(`${process.env.REST_ENDPOINT || env.REST_ENDPOINT || "http://192.168.2.5:5050"}/api/signin/${token}`)

    const data = await response.json()
    if (response.ok) {
      if (data?.user) {
        return true
      }
    }
    return false

  } catch (e) {
    return false
  }
}
