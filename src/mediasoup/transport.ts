import { WebRtcTransport, Router } from 'mediasoup/node/lib/types'

const transportOptions = {
  listenIps: [
    { ip: '0.0.0.0', announcedIp: process.env.ANNOUNCED_IP || '192.168.2.5' } // Replace with public IP
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  // initialAvailableOutgoingBitrate: 1000000,
}

export async function createWebRtcTransport(router: Router): Promise<WebRtcTransport> {
  const transport = await router.createWebRtcTransport(transportOptions)

  transport.on('dtlsstatechange', dtlsState => {
    if (dtlsState === 'closed') {
      console.log('Transport closed due to DTLS state "closed"')
      transport.close()
    }
  })

  transport.on('routerclose', () => {
    console.log('Transport closed')
  })

  console.log(`WebRTC Transport created: ${transport.id}`)

  return transport
}
