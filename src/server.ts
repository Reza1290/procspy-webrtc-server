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
import client from 'prom-client'

dotenv.config()

const PORT = process.env.PORT || 3000

console.log(process.env.PORT)
let server
const isProduction = process.env.NODE_ENV === 'production';



const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const bitrateGauge = new client.Gauge({
  name: 'transport_stats',
  help: 'Current stats of webrtc server',
  labelNames: ['transport_id'],
});
register.registerMetric(bitrateGauge);






const app = express()
if (isProduction) {
  server = http.createServer(app)
  server.listen(Number(PORT), '0.0.0.0',  () => {
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
    console.log(`Server using http proxied port ${PORT}`);
  });
}

// routes here
indexRoutes(app)
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err: any) {
    res.status(500).end(err.message);
  }
});


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
      return next(new Error('Who Are You?[0]'))
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
    return next(new Error('Who are you?[1]'))
  }

  const deviceId = socket.handshake.auth?.deviceId
  const userAgent = socket.handshake.auth?.userAgent

  const pass = await isOwnerOfTheToken(token, deviceId, userAgent, "")
  if(!pass){
    return next(new Error('Who Are You?[2]'))
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
    console.error(error)
  }
  return false
}

const verifyToken = async (token: string): Promise<boolean> => {

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
    console.error(e)
  }
  return false
}
