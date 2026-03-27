export const ROOM_CODE_REGEX = /^[A-Z0-9]{6,12}$/;

const createClient = (socketId) => ({
  id: socketId,
  name: 'Unknown Device',
  isHost: false,
  volume: 1,
  status: 'Idle',
  latency: 0,
  joinedAt: Date.now(),
});

const createRoom = () => ({
  createdAt: Date.now(),
  currentAudioBuffer: null,
  currentAudioType: null,
  currentAudioName: null,
  playbackState: {
    isPlaying: false,
    startTime: 0,
    elapsed: 0,
  },
  clients: new Map(),
  currentHostId: null,
});

export class RoomStore {
  constructor() {
    this.rooms = new Map();
  }

  normalizeRoomCode(value) {
    if (!value || typeof value !== 'string') return '';
    return value.toUpperCase().trim();
  }

  generateRoomCode() {
    let code = '';
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (this.rooms.has(code));
    return code;
  }

  resolveRoomCode(requestedRoomCode) {
    const normalized = this.normalizeRoomCode(requestedRoomCode);
    if (ROOM_CODE_REGEX.test(normalized)) return normalized;
    return this.generateRoomCode();
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, createRoom());
    }
    return this.rooms.get(roomId);
  }

  syncHostFlags(room) {
    room.clients.forEach((client, id) => {
      client.isHost = room.currentHostId === id;
    });
  }

  joinRoom(roomId, socketId) {
    const room = this.getOrCreateRoom(roomId);
    if (!room.clients.has(socketId)) {
      room.clients.set(socketId, createClient(socketId));
    }
    if (!room.currentHostId) {
      room.currentHostId = socketId;
    }
    this.syncHostFlags(room);
    return room;
  }

  leaveRoom(roomId, socketId) {
    const room = this.getRoom(roomId);
    if (!room) return { room: null, deleted: false };

    room.clients.delete(socketId);
    if (room.currentHostId === socketId) {
      room.currentHostId = null;
      const nextClient = room.clients.values().next().value;
      if (nextClient) room.currentHostId = nextClient.id;
    }
    this.syncHostFlags(room);

    if (room.clients.size === 0) {
      this.rooms.delete(roomId);
      return { room: null, deleted: true };
    }

    return { room, deleted: false };
  }

  getClient(roomId, socketId) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    return room.clients.get(socketId) || null;
  }

  listClients(roomId) {
    const room = this.getRoom(roomId);
    if (!room) return [];
    return Array.from(room.clients.values());
  }

  updateIdentity(roomId, socketId, data) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    const client = room.clients.get(socketId);
    if (!client) return null;

    if (data.isHost !== undefined) {
      if (data.isHost) {
        if (!room.currentHostId || room.currentHostId === socketId) {
          room.currentHostId = socketId;
        }
      } else if (room.currentHostId === socketId) {
        room.currentHostId = null;
      }
    }

    if (data.name) client.name = data.name;
    if (data.volume !== undefined) client.volume = data.volume;
    if (data.status) client.status = data.status;

    if (!room.currentHostId) {
      const nextClient = room.clients.values().next().value;
      if (nextClient) room.currentHostId = nextClient.id;
    }

    this.syncHostFlags(room);
    return client;
  }

  requireHost(roomId, socketId) {
    const room = this.getRoom(roomId);
    if (!room) return false;
    return room.currentHostId === socketId;
  }

  assignHost(roomId, requestedById, targetId) {
    const room = this.getRoom(roomId);
    if (!room) return { ok: false, reason: 'Room not found.' };
    if (room.currentHostId !== requestedById) {
      return { ok: false, reason: 'Only host can assign a new host.' };
    }
    if (!room.clients.has(targetId)) {
      return { ok: false, reason: 'Target device is not in this room.' };
    }
    room.currentHostId = targetId;
    this.syncHostFlags(room);
    return { ok: true, room };
  }
}
