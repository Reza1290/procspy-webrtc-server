import { Router } from 'mediasoup/node/lib/types'
import { getMediasoupWorker } from './worker'

interface Room {
  router: Router;
  peers: string[];
}

export class RoomManager {
  private rooms: Record<string, Room> = {};

  constructor(private mediaCodecs: any) {}

  async createRoom( roomId: string, socketId: string): Promise<Router> {
    if (!this.rooms[roomId]) {
      const worker = await getMediasoupWorker()
      const router = await worker.createRouter({mediaCodecs: this.mediaCodecs})
      this.rooms[roomId] = {
        router,
        peers: [socketId]
      };
      console.log(`Created router ID: ${router.id}`);
    } else {
      if (!this.rooms[roomId].peers.includes(socketId)) {
        this.rooms[roomId].peers.push(socketId);
      }
    }

    return this.rooms[roomId].router;
  }

  getRouter(roomId: string): Router | undefined {
    return this.rooms[roomId]?.router;
  }

  getPeers(roomId: string): string[] {
    return this.rooms[roomId]?.peers || [];
  }

  removePeer(roomId: string, socketId: string): void {
    const room = this.rooms[roomId];
    if (!room) return;

    room.peers = room.peers.filter(id => id !== socketId);

    if (room.peers.length === 0) {
      delete this.rooms[roomId];
      console.log(`Room ${roomId} is now empty. Deleted.`);
    }
  }

  roomExists(roomId: string): boolean {
    return !!this.rooms[roomId];
  }
}
