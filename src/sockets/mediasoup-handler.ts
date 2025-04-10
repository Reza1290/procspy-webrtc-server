import { Server, Socket } from "socket.io";
import { Worker, Router, Transport, Producer, Consumer, RtpCapabilities, DtlsParameters, AppData, RtpCodecCapability } from "mediasoup/node/lib/types";
import * as mediasoup from 'mediasoup'
import { config } from "../config/config";
import { createWebRtcTransport } from "../mediasoup/transport";
interface PeerDetails {
  isAdmin: boolean;
  socketId: string;
}
import { createWorker as mediasoupCreateWorker } from 'mediasoup'


interface Peer {
  socket: Socket;
  roomCode: string;
  transports: string[];
  producers: string[];
  consumers: string[];
  peerDetails: PeerDetails;
}

interface Room {
  router: Router;
  peers: string[];
}

interface TransportData {
  socketId: string;
  transport: Transport;
  roomCode: string;
  consumer: boolean;
}

interface ProducerData {
  socketId: string;
  producer: Producer;
  roomCode: string;
  appData: any;
}

interface ConsumerData {
  socketId: string;
  consumer: Consumer;
  roomCode: string;
  appData: any;
}

// Assuming these are defined globally or injected
// declare const connections: Server;
// declare const worker: Worker;
// declare const mediaCodecs: any;

let rooms: Record<string, Room> = {};
let peers: Record<string, Peer> = {};
let transports: TransportData[] = [];
let producers: ProducerData[] = [];
let consumers: ConsumerData[] = [];
let worker: Worker

const mediaCodecs: RtpCodecCapability[] = [
  {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
  },
  {
      kind: 'video',
      mimeType: 'video/VP8',
      clockRate: 90000,
      parameters: {
          'x-google-start-bitrate': 1000,
      },
  }
]

const createWorker = async () => {
  worker = await mediasoupCreateWorker({
    
  })
  console.log(`worker pid ${worker.pid}`)

  worker.on('died', error => {
    console.error('mediasoup worker has died')
    setTimeout(() => process.exit(1), 2000) // exit in 2 seconds
  })

  return worker
}
const init = async () => {
  worker = await createWorker()
}

init()

export const handleSocketConnection = async (socket: Socket) => {
  console.log(socket.id);
  socket.emit("connection-success", {
    socketId: socket.id,
  });

  const removeItems = <T extends { socketId: string; [key: string]: any }>(
    items: T[],
    socketId: string,
    type: string
  ): T[] => {
    items.forEach((item) => {
      if (item.socketId === socketId) {
        item[type].close();
      }
    });
    return items.filter((item) => item.socketId !== socketId);
  };

  socket.on("disconnect", () => {
    console.log("peer disconnected");
    console.log("disko", socket.id);
    consumers = removeItems(consumers, socket.id, "consumer");
    producers = removeItems(producers, socket.id, "producer");
    transports = removeItems(transports, socket.id, "transport");

    const roomCode = peers[socket.id]?.roomCode;
    if (roomCode && rooms[roomCode]) {
      rooms[roomCode].peers = rooms[roomCode].peers.filter((id) => id !== socket.id);
      console.log(`Updated peers in room ${roomCode}:`, rooms[roomCode].peers);

      if (rooms[roomCode].peers.length === 0) {
        console.log(`Room ${roomCode} is now empty. Deleting...`);
        delete rooms[roomCode];
      }

      delete peers[socket.id];
    }
  });

  socket.on("joinRoom", async ({ roomCode, isAdmin, socketId }, callback) => {
    const router1 = await createRoom(roomCode, socket.id);
    peers[socket.id] = {
      socket,
      roomCode,
      transports: [],
      producers: [],
      consumers: [],
      peerDetails: {
        isAdmin,
        socketId,
      },
    };
    const rtpCapabilities = router1.rtpCapabilities;
    callback({ rtpCapabilities });
  });

  const createRoom = async (roomCode: string, socketId: string): Promise<Router> => {
    let router1: Router;
    let peerIds: string[] = [];
    if (rooms[roomCode]) {
      router1 = rooms[roomCode].router;
      peerIds = rooms[roomCode].peers || [];
    } else {
      router1 = await worker.createRouter({ mediaCodecs });
    }

    console.log(`Router ID: ${router1.id}`, peerIds.length);
    rooms[roomCode] = {
      router: router1,
      peers: [...peerIds, socketId],
    };

    return router1;
  };

  socket.on("createWebRtcTransport", async ({ consumer }: { consumer: boolean }, callback) => {
    const roomCode = peers[socket.id].roomCode;
    const router = rooms[roomCode].router;

    try {
      const transport = await createWebRtcTransport(router);
      callback({
        params: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        },
      });

      addTransport(transport, roomCode, consumer);
    } catch (error) {
      console.log(error);
    }
  });

  const addTransport = (transport: Transport, roomCode: string, consumer: boolean) => {
    transports = [...transports, { socketId: socket.id, transport, roomCode, consumer }];

    peers[socket.id] = {
      ...peers[socket.id],
      transports: [...peers[socket.id].transports, transport.id],
    };
  };

  const addProducer = (producer: Producer, roomCode: string, appData: any) => {
    producers = [...producers, { socketId: socket.id, producer, roomCode, appData }];

    peers[socket.id] = {
      ...peers[socket.id],
      producers: [...peers[socket.id].producers, producer.id],
    };
  };

  const addConsumer = (consumer: Consumer, roomCode: string, appData: any) => {
    consumers = [...consumers, { socketId: socket.id, consumer, roomCode, appData }];

    peers[socket.id] = {
      ...peers[socket.id],
      consumers: [...peers[socket.id].consumers, consumer.id],
    };
  };

  socket.on("getProducers", (callback) => {
    const { roomCode } = peers[socket.id];
    const producerList = producers
      .filter((p) => p.socketId !== socket.id && p.roomCode === roomCode)
      .map((p) => p.producer.id);
    callback(producerList);
  });

  const informConsumers = (roomCode: string, socketId: string, id: string) => {
    console.log(`just joined, id ${id} ${roomCode}, ${socketId}`);
    producers.forEach((producerData) => {
      if (producerData.socketId !== socketId && producerData.roomCode === roomCode) {
        peers[producerData.socketId].socket.emit("new-producer", { producerId: id });
      }
    });

    const filteredPeers = Object.fromEntries(
      Object.entries(peers).filter(
        ([key, val]) => val.peerDetails?.isAdmin && val.socket.id !== socketId
      )
    );

    for (const props in filteredPeers) {
      peers[props].socket.emit("new-producer", { producerId: id });
    }
  };

  const getTransport = (socketId: string): Transport => {
    const transportData = transports.find(
      (t) => t.socketId === socketId && !t.consumer
    );
    return transportData!.transport;
  };

  socket.on("transport-connect", ({ dtlsParameters }: { dtlsParameters: DtlsParameters }) => {
    getTransport(socket.id).connect({ dtlsParameters });
  });

  socket.on("transport-produce", async ({ kind, rtpParameters, appData }, callback) => {
    const producer = await getTransport(socket.id).produce({ kind, rtpParameters, appData });

    const { roomCode } = peers[socket.id];
    addProducer(producer, roomCode, appData);
    informConsumers(roomCode, socket.id, producer.id);

    producer.on("transportclose", () => {
      producer.close();
    });

    callback({
      id: producer.id,
      producersExist: producers.length > 1,
    });
  });

  socket.on("transport-recv-connect", async ({ dtlsParameters, serverConsumerTransportId }) => {
    const consumerTransport = transports.find(
      (t) => t.consumer && t.transport.id === serverConsumerTransportId
    )!.transport;

    await consumerTransport.connect({ dtlsParameters });
  });

  socket.on(
    "consume",
    async ({ rtpCapabilities, remoteProducerId, serverConsumerTransportId }, callback) => {
      try {
        const { roomCode } = peers[socket.id];
        const router = rooms[roomCode].router;
        const consumerTransport = transports.find(
          (t) => t.consumer && t.transport.id === serverConsumerTransportId
        )!.transport;

        if (
          router.canConsume({
            producerId: remoteProducerId,
            rtpCapabilities,
          })
        ) {
          const producerData = producers.find((p) => p.producer.id === remoteProducerId);
          const producerAppData = producerData?.appData || {};

          const consumer = await consumerTransport.consume({
            producerId: remoteProducerId,
            rtpCapabilities,
            paused: true,
            appData: producerAppData,
          });

          consumer.on("transportclose", () => {
            console.log("transport close from consumer");
          });

          consumer.on("producerclose", () => {
            console.log("producer of consumer closed");
            socket.emit("producer-closed", { remoteProducerId });

            consumerTransport.close();
            transports = transports.filter((t) => t.transport.id !== consumerTransport.id);
            consumer.close();
            consumers = consumers.filter((c) => c.consumer.id !== consumer.id);
          });

          addConsumer(consumer, roomCode, producerAppData);

          const params = {
            id: consumer.id,
            producerId: remoteProducerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            serverConsumerId: consumer.id,
            appData: consumer.appData,
          };

          callback({ params });
        }
      } catch (error: any) {
        callback({ params: { error: error.message } });
      }
    }
  );

  socket.on("consumer-resume", async ({ serverConsumerId }) => {
    const { consumer } = consumers.find((c) => c.consumer.id === serverConsumerId)!;
    await consumer.resume();
  });

  socket.on("log-message", async ({ message }, callback) => {
    console.log(message);
    console.log(peers);
    broadcastToRoom(peers, "2", "server-log-message", { message: "Hello, room 2!" });
    callback({ success: true });
  });

  const broadcastToRoom = (
    peers: Record<string, Peer>,
    roomCode: string,
    event: string,
    data: any
  ) => {
    for (const socketId in peers) {
      if (peers[socketId].roomCode === roomCode) {
        peers[socketId].socket.emit(event, data);
      }
    }
  };
};
