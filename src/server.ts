import express from 'express'
import http from 'http'
import { Server as SocketIOServer } from 'socket.io'
import path from 'path'

import indexRoutes from './routes/index-routes'
// import { handleSocketConnection } from './sockets/mediasoupHandler'

const PORT = 3000

const app = express()

// routes here
indexRoutes(app)

const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
  
const io = new SocketIOServer(server, { cors: { origin: '*' } })




// io.of('/mediasoup').on('connection', handleSocketConnection)

