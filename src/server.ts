import express from 'express'
import https from 'https'
import http from 'http'
import fs from 'fs'
import { Server as SocketIOServer } from 'socket.io'
import path from 'path'
import indexRoutes from './routes/index-routes'
import { handleSocketConnection, peers } from './sockets/mediasoup-handler'
import dotenv from 'dotenv';
import { Socket } from 'dgram'
dotenv.config()

const PORT = process.env.PORT || 3000

console.log(process.env.PORT)
let server
const isProduction = process.env.NODE_ENV === 'production' || false;

const app = express()
if (isProduction) {
  server = http.createServer(app)
  server.listen(PORT, () => {
    console.log(`Server using http proxied port ${PORT}`)
  })
} else {
  const sslOptions = {
    key: fs.readFileSync('./cert/key.pem'),
    cert: fs.readFileSync('./cert/cert.pem'),
    rejectUnauthorized: false
  }

  server = https.createServer(sslOptions, app)
  server.listen(PORT, () => {
    console.log(`Server running securely on https://localhost:${PORT}`)
  })
}

// routes here
indexRoutes(app)


const io = new SocketIOServer(server, {
  maxHttpBufferSize: 2e9,
  cors: {
    origin: '*',
  },
})

io.of('/mediasoup').use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  const secretAdmin = socket.handshake.auth?.secretAdmin
  console.log(socket.handshake.auth)
  if (secretAdmin) {
    if (secretAdmin === (process.env.SECRET_ADMIN || "SECRETBANGET")) {
      return next()
    } else {
      return next(new Error('Who Are You?'))
    }
  }

  const isValid = await verifyToken(token);

  if (!isValid) {
    return next(new Error('Invalid token'));
  }

  if (!token && !secretAdmin) {
    return next(new Error('Authentication token missing'));
  }

  if (isTokenAlreadyUsed(token)) {
    return next(new Error('Who are you?'))
  }

  const deviceId = socket.handshake.auth?.deviceId
  const userAgent = socket.handshake.auth?.userAgent
  const ipAddress = socket.handshake.address
  const pass = await isOwnerOfTheToken(token, deviceId, userAgent, ipAddress)
  if(!pass){
    return next(new Error('Who Are You?'))
  }


  next();
});
io.of('/mediasoup').on('connection', handleSocketConnection)

function isTokenAlreadyUsed(token: string): boolean {
  return Object.values(peers).some(peer => peer.peerDetails.token === token);
}

const isOwnerOfTheToken = async (token: string, deviceId: string, userAgent: string, ipAddress: string): Promise<boolean> => {
  try {
    const response = await fetch(`${process.env.ENDPOINT || 'https://192.168.2.5:5050'}/api/session-detail`, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Secret ${process.env.SECRET || "SECRET"}`
      },
      body: JSON.stringify({
        token,
        ipAddress: "",
        userAgent,
        deviceId,
      }),
    });

    if (response.ok){
      return true
    }

    return false
  } catch (error) {

  }
  return false
}

const verifyToken = async (token: string): Promise<boolean> => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    const response = await fetch(`${process.env.ENDPOINT || "http://192.168.2.5:5050"}/api/signin/${token}`)

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
