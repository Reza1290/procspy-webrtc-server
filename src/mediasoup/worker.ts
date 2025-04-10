import { Worker } from 'mediasoup/node/lib/WorkerTypes'

let worker: Worker

export async function getMediasoupWorker(): Promise<Worker> {
  if (worker) return worker

  worker = await createWorker()
  return worker
}

async function createWorker(): Promise<Worker> {
  const worker = await (await import('mediasoup')).createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
  })

  console.log(' Mediasoup worker created [PID]', worker.pid)

  worker.on('died', () => {
    console.error(' Mediasoup worker died. Restarting in 2 seconds...')
    setTimeout(() => process.exit(1), 2000)
  })

  return worker
}
