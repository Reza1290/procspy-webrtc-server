import { Server, Socket } from "socket.io";
import { Worker, Router, Transport, Producer, Consumer, RtpCapabilities, DtlsParameters, AppData, RtpCodecCapability } from "mediasoup/node/lib/types";
import * as mediasoup from 'mediasoup'
import { config } from "../config/config";
import { createWebRtcTransport } from "../mediasoup/transport";
interface PeerDetails {
  isAdmin: boolean;
  socketId: string;
  token: string | null;
}
import { createWorker as mediasoupCreateWorker } from 'mediasoup'
import { httpsAgent } from "../config/https-agent";
import { env } from "process";
import { DeviceInfo } from "./types";


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

  const removeItems = <T extends { socketId: string;[key: string]: any }>(
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

    const roomId = peers[socket.id]?.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].peers = rooms[roomId].peers.filter((id) => id !== socket.id);
      console.log(`Updated peers in room ${roomId}:`, rooms[roomId].peers);

      if (rooms[roomId].peers.length === 0) {
        console.log(`Room ${roomId} is now empty. Deleting...`);
        delete rooms[roomId];
      }

      delete peers[socket.id];
    }
  });

  socket.on("joinRoom", async ({ roomId, isAdmin, socketId, token }, callback) => {
    const router1 = await createRoom(roomId, socket.id);
    console.log(token)
    peers[socket.id] = {
      socket,
      roomId,
      transports: [],
      producers: [],
      consumers: [],
      peerDetails: {
        isAdmin: isAdmin ?? false,
        socketId: socketId || socket.id,
        token: token || "000000",
      },
    };
    const rtpCapabilities = router1.rtpCapabilities;
    callback({ rtpCapabilities });
  });

  const createRoom = async (roomId: string, socketId: string): Promise<Router> => {
    let router1: Router;
    let peerIds: string[] = [];
    if (rooms[roomId]) {
      router1 = rooms[roomId].router;
      peerIds = rooms[roomId].peers || [];
    } else {
      router1 = await worker.createRouter({ mediaCodecs });
    }

    console.log(`Router ID: ${router1.id}`, peerIds.length);
    rooms[roomId] = {
      router: router1,
      peers: [...peerIds, socketId],
    };

    return router1;
  };

  socket.on("createWebRtcTransport", async ({ consumer }: { consumer: boolean }, callback) => {
    const roomId = peers[socket.id].roomId;
    const router = rooms[roomId].router;

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

      addTransport(transport, roomId, consumer);
    } catch (error) {
      console.log(error);
    }
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

  socket.on("getSingleUserProducers", (consumeSocketId, callback) => {
    const { roomId } = peers[socket.id];
    console.log("producers", producers)
    const producerList = producers
      .filter((p) => p.socketId === consumeSocketId && p.roomId === roomId)
      .map((p) => p.producer.id);
    // console.log(producerList)
    console.log('SINGLE', producerList)
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
        const router = rooms[roomId].router;
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

  socket.on("DASHBOARD_SERVER_MESSAGE", async (data, callback) => {
    sendPrivateMessage(data.data)
  })

  socket.on("EXTENSION_SERVER_MESSAGE", async ({ data }, callback) => {
    const { action } = data
    console.log(data)
    switch (action) {
      case "PRIVATE_MESSAGE":

        await broadcastToRoomProctor(peers, data.roomId, "SERVER_DASHBOARD_PRIVATE_MESSAGE", data)
        callback({
          success: true
        })
        break
      case "LOG_MESSAGE":
        await saveLog(data.flagKey, data.token, data?.attachment)
        await broadcastToRoomProctor(peers, data.roomId, "SERVER_DASHBOARD_LOG_MESSAGE", data)
        break
      case "UPDATE_DEVICE_INFO":
        console.log("HELLLLLLLLLLLLLLLLLLLL NAHHHHHHHHHHHHHHHHHHHHHH")
        await updateDeviceInfo(data.deviceInfo, data.token)
        break
    }
  })

  socket.on("EXTENSION_PING", (callback) => {
    const ip = socket.handshake.address;
    callback({ ip })
  })

  // socket.on("", async ({ data }) => {
  //   console.log('data device', data)
  //   const { deviceInfo, token } = data
  //   updateDeviceInfo(deviceInfo, token)
  // })

  const updateDeviceInfo = async (deviceInfo: DeviceInfo, token: string) => {
    //TODO:: UPDATE DEVICE INFO
    
    try {
      const ipAddress = socket.handshake.address;
      const vmIndicators = ['virtualbox', 'vmware', 'qemu', 'vbox', 'parallels', 'xen', 'microsoft basic render'];
      const isRendererVM = vmIndicators.some(kw =>
        deviceInfo.gpu?.toLowerCase().includes(kw)
      );

      const memoryGB = parseFloat(deviceInfo.ramSize!) || 0;
      deviceInfo.isVM = isRendererVM || deviceInfo.cpuNumOfProcessors <= 2 || memoryGB <= 2;
      const response = await fetch(`${process.env.ENDPOINT || 'https://192.168.2.5:5050'}/api/session-detail`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Secret ${process.env.SECRET || env.SECRET || "SECRET"}`
        },
        body: JSON.stringify({
          token,
          ipAddress,
          ...deviceInfo,
        }),
      });
    } catch (e) {
      console.log(e)
    }
  }

  const saveLog = async (flagKey: string, token: string, attachment: Record<string, any> = {}) => {

    if (attachment?.file) {
      const buffer = base64toImage(attachment.file)
      const file = bufferToFile(buffer,
        "image.png"
        , 'image/png')
      attachment.file = await saveFile(file)
    }


    try {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

      const response = await fetch(`${process.env.ENDPOINT || 'https://192.168.2.5:5050'}/api/save-log`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Secret ${process.env.SECRET || env.SECRET || "SECRET"}`
        },
        body: JSON.stringify({
          flagKey: flagKey,
          token: token,
          attachment: attachment,
          secret: `${process.env.SECRET || env.SECRET || "SECRET"}`,
        }),
      });


      if (response.ok) {

      }
    } catch (e) {
      console.error(e)
    }
  }

  const saveFile = async (file: File): Promise<string | null> => {

    const formData = new FormData()
    formData.append('file', file)
    formData.append('secret', `${process.env.SECRET || env.SECRET || "SECRET"}`)
    try {

      const response = await fetch(`${env.ENDPOINT || process.env.ENDPOINT || "https://192.168.2.5:5050/api/storage"}`, {
        method: "POST",
        headers: {
          'Authorization': `Secret ${process.env.SECRET || env.SECRET || "SECRET"}`
        },
        body: formData
      })

      const data = await response.json()
      if (response.ok) {
        return data.path
      } else {
        return null
      }
    } catch (e) {
      return null
    }
  }

  const base64toImage = (base64: string) => {
    const base64Data = base64.split(',')[1]; // Remove the data URL prefix
    return Buffer.from(base64Data, 'base64')
  }

  const bufferToFile = (buffer: Buffer, filename: string, mimeType: string) => {
    const blob = new Blob([buffer], { type: mimeType })
    return new File([blob], filename, { type: mimeType })
  }

  const sendPrivateMessage = async (data: {
    body: string,
    roomId: string,
    token: string,
  }) => {
    
    //TODO: ntar tambahin ke consumer aja

    for (const socketId in peers) {
  
      if (peers[socketId].roomId === data.roomId && peers[socketId].peerDetails.token === data.token) {

        peers[socketId].socket.emit("SERVER_EXTENSION_MESSAGE", data);
      }
    }
  }

  const broadcastToRoomProctor = async (
    peers: Record<string, Peer>,
    roomId: string,
    event: string,
    data: any
  ) => {
    console.log(peers)
    for (const socketId in peers) {
      if (peers[socketId].roomId === roomId && peers[socketId].peerDetails.isAdmin) {
        peers[socketId].socket.emit(event, data);
      }
    }
  };

};
