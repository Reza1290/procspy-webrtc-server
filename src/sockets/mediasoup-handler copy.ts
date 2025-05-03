import { Socket } from 'socket.io'
import { Consumer, DtlsParameters, Producer, Router, Transport } from 'mediasoup/node/lib/types'
import { createWebRtcTransport } from '../mediasoup/transport'
import { getMediasoupWorker } from '../mediasoup/worker'
import { RoomManager } from '../mediasoup/room'
import { config } from '../config/config'


interface PeerDetails {
  isAdmin: boolean;
  socketId: string;
}

interface Peer {
  socket: Socket;
  roomId: string;
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
  roomId: string;
  consumer: boolean;
}

interface ProducerData {
  socketId: string;
  producer: Producer;
  roomId: string;
  appData: any;
}

interface ConsumerData {
  socketId: string;
  consumer: Consumer;
  roomId: string;
  appData: any;
}

// Assuming these are defined globally or injected

let rooms: Record<string, Room> = {};
let peers: Record<string, Peer> = {};
let transports: TransportData[] = [];
let producers: ProducerData[] = [];
let consumers: ConsumerData[] = [];

const roomManager = new RoomManager(config.mediaCodecs)

export async function handleSocketConnection(socket: Socket) {
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

  socket.on('disconnect', () => {
    console.log('peer disconnected', socket.id);
  
    consumers = removeItems(consumers, socket.id, 'consumer');
    producers = removeItems(producers, socket.id, 'producer');
    transports = removeItems(transports, socket.id, 'transport');
  
    const roomId = peers[socket.id]?.roomId;
    if (roomId) {
      roomManager.removePeer(roomId, socket.id);
    }
  
    delete peers[socket.id];
  });

  socket.on("joinRoom", async ({ roomId, isAdmin, socketId }, callback) => {
    const router1 = await roomManager.createRoom(roomId, socket.id)

    peers[socket.id] = {
      socket,
      roomId,
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

  // const createRoom = async (roomId: string, socketId: string): Promise<Router> => {
  //   let router1: Router;
  //   let peerIds: string[] = [];
  //   if (rooms[roomId]) {
  //     router1 = rooms[roomId].router;
  //     peerIds = rooms[roomId].peers || [];
  //   } else {
  //     router1 = await worker.createRouter({ mediaCodecs });
  //   }

  //   console.log(`Router ID: ${router1.id}`, peerIds.length);
  //   rooms[roomId] = {
  //     router: router1,
  //     peers: [...peerIds, socketId],
  //   };

  //   return router1;
  // };

  socket.on('createWebRtcTransport', async ({ consumer }, callback) => {
    const roomId = peers[socket.id].roomId;
    const router = roomManager.getRouter(roomId);
  
    if (!router) {
      console.error("No router found for room", roomId);
      return;
    }
  
    createWebRtcTransport(router).then(
      transport => {
        callback({
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          }
        });
  
        addTransport(transport, roomId, consumer);
      },
      error => {
        console.log(error);
      }
    );
  });
  

  const addTransport = (transport: Transport, roomId: string, consumer: boolean) => {
    transports = [...transports, { socketId: socket.id, transport, roomId, consumer }];

    peers[socket.id] = {
      ...peers[socket.id],
      transports: [...peers[socket.id].transports, transport.id],
    };
  };

  const addProducer = (producer: Producer, roomId: string, appData: any) => {
    producers = [...producers, { socketId: socket.id, producer, roomId, appData }];

    peers[socket.id] = {
      ...peers[socket.id],
      producers: [...peers[socket.id].producers, producer.id],
    };
  };

  const addConsumer = (consumer: Consumer, roomId: string, appData: any) => {
    consumers = [...consumers, { socketId: socket.id, consumer, roomId, appData }];

    peers[socket.id] = {
      ...peers[socket.id],
      consumers: [...peers[socket.id].consumers, consumer.id],
    };
  };

  socket.on("getProducers", (callback) => {
    const { roomId } = peers[socket.id];
    const producerList = producers
      .filter((p) => p.socketId !== socket.id && p.roomId === roomId)
      .map((p) => p.producer.id);
    callback(producerList);
  });

  const informConsumers = (roomId: string, socketId: string, id: string) => {
    console.log(`just joined, id ${id} ${roomId}, ${socketId}`);
    producers.forEach((producerData) => {
      if (producerData.socketId !== socketId && producerData.roomId === roomId) {
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

    const { roomId } = peers[socket.id];
    addProducer(producer, roomId, appData);
    informConsumers(roomId, socket.id, producer.id);

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
        const { roomId } = peers[socket.id];
        const router = roomManager.getRouter(roomId);
        console.log(router)
        if (!router) {
          console.error("No router found for room", roomId);
          return;
        }


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

          addConsumer(consumer, roomId, producerAppData);

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

  // socket.on("log-message", async ({ message }, callback) => {
  //   console.log(message);
  //   console.log(peers);
  //   // broadcastToRoom(peers, "2", "server-log-message", { message: "Hello, room 2!" });
  //   callback({ success: true });
  // });

  const broadcastToRoom = (
    peers: Record<string, Peer>,
    roomId: string,
    event: string,
    data: any
  ) => {
    for (const socketId in peers) {
      if (peers[socketId].roomId === roomId) {
        peers[socketId].socket.emit(event, data);
      }
    }
  };
}

// function getPeerTransport(socketId: string, isConsumer = false) {
//   return transports.find(t => t.socketId === socketId && t.consumer === isConsumer)?.transport
// }

// function getTransportById(id: string) {
//   return transports.find(t => t.transport.id === id)?.transport
// }

// function notifyOthers(roomId: string, currentSocketId: string, producerId: string) {
//   for (const peerId in peers) {
//     const peer = peers[peerId]
//     if (peer.roomId === roomId && peerId !== currentSocketId) {
//       peer.socket.emit('new-producer', { producerId })
//     }
//   }
// }

// function cleanup(socketId: string) {
//   // Cleanup transports, producers, consumers
//   ['transports', 'producers', 'consumers'].forEach(type => {
//     let items = eval(type)
//     items
//       .filter((item: any) => item.socketId === socketId)
//       .forEach((item: any) => item[type.slice(0, -1)].close())

//     eval(`${type} = items.filter(item => item.socketId !== socketId)`)
//   })

//   delete peers[socketId]
// }
