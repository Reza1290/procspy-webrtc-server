import { Router } from 'mediasoup/node/lib/types'
import { getMediasoupWorker } from './worker'

interface Room {
  router: Router;
  peers: string[];
}

export class RoomManager {
  private rooms: Record<string, Room> = {};

  constructor(private mediaCodecs: any) {}

  async createRoom( roomCode: string, socketId: string): Promise<Router> {
    if (!this.rooms[roomCode]) {
      const worker = await getMediasoupWorker()
      const router = await worker.createRouter({mediaCodecs: this.mediaCodecs})
      this.rooms[roomCode] = {
        router,
        peers: [socketId]
      };
      console.log(`Created router ID: ${router.id}`);
    } else {
      if (!this.rooms[roomCode].peers.includes(socketId)) {
        this.rooms[roomCode].peers.push(socketId);
      }
    }

    return this.rooms[roomCode].router;
  }

  getRouter(roomCode: string): Router | undefined {
    return this.rooms[roomCode]?.router;
  }

  getPeers(roomCode: string): string[] {
    return this.rooms[roomCode]?.peers || [];
  }

  removePeer(roomCode: string, socketId: string): void {
    const room = this.rooms[roomCode];
    if (!room) return;

    room.peers = room.peers.filter(id => id !== socketId);

    if (room.peers.length === 0) {
      delete this.rooms[roomCode];
      console.log(`Room ${roomCode} is now empty. Deleted.`);
    }
  }

  roomExists(roomCode: string): boolean {
    return !!this.rooms[roomCode];
  }
}
