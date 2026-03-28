import { RoomStore } from './roomStore.js';

const roomStore = new RoomStore();

export const registerSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    let currentRoomId = null;

    const withRoom = (cb) => {
      if (!currentRoomId) {
        socket.emit('room_error', 'Join a room first.');
        return;
      }
      const room = roomStore.getRoom(currentRoomId);
      if (!room) {
        socket.emit('room_error', 'Room not found.');
        return;
      }
      cb(room);
    };

    const broadcastClients = () => {
      if (!currentRoomId) return;
      io.to(currentRoomId).emit('clients_update', roomStore.listClients(currentRoomId));
    };

    const ensureHost = (action) => {
      if (!roomStore.requireHost(currentRoomId, socket.id)) {
        socket.emit('host_error', `Only the host can ${action}.`);
        return false;
      }
      return true;
    };

    socket.on('join_room', ({ roomId }, cb) => {
      const nextRoomId = roomStore.resolveRoomCode(roomId);

      if (currentRoomId) {
        socket.leave(currentRoomId);
        roomStore.leaveRoom(currentRoomId, socket.id);
      }

      currentRoomId = nextRoomId;
      socket.join(currentRoomId);

      const room = roomStore.joinRoom(currentRoomId, socket.id);
      const client = roomStore.getClient(currentRoomId, socket.id);

      socket.emit('playback_state', room.playbackState);
      socket.emit('room_meta', { roomId: currentRoomId, createdAt: room.createdAt });
      if (room.currentAudioName) {
        socket.emit('audio_available', { name: room.currentAudioName, type: room.currentAudioType });
      }

      broadcastClients();
      io.to(currentRoomId).emit('host_changed', { hostId: room.currentHostId });

      if (typeof cb === 'function') {
        cb({ roomId: currentRoomId, isHost: client?.isHost ?? false, createdAt: room.createdAt });
      }
    });

    socket.on('update_identity', (data) => {
      withRoom(() => {
        const client = roomStore.updateIdentity(currentRoomId, socket.id, data);
        if (!client) return;
        broadcastClients();
        socket.emit('identity_corrected', { isHost: client.isHost });
      });
    });

    socket.on('timesync', (clientSendTime, cb) => {
      const serverTime = Date.now();
      cb(serverTime, clientSendTime);

      withRoom(() => {
        const client = roomStore.getClient(currentRoomId, socket.id);
        if (client) client.latency = serverTime - clientSendTime;
      });
    });

    socket.on('upload_audio', ({ name, type, buffer }) => {
      withRoom((room) => {
        if (!ensureHost('upload tracks')) return;

        room.currentAudioBuffer = buffer;
        room.currentAudioType = type;
        room.currentAudioName = name;
        room.playbackState = { isPlaying: false, startTime: 0, elapsed: 0 };

        io.to(currentRoomId).emit('stop');
        io.to(currentRoomId).emit('audio_available', { name, type });
      });
    });

    socket.on('request_audio', (cb) => {
      withRoom((room) => {
        const client = roomStore.getClient(currentRoomId, socket.id);
        if (client) {
          client.status = 'Downloading';
          broadcastClients();
        }

        if (room.currentAudioBuffer) {
          cb({ buffer: room.currentAudioBuffer, type: room.currentAudioType, name: room.currentAudioName });
          if (client) {
            client.status = 'Ready';
            broadcastClients();
          }
          return;
        }
        cb(null);
      });
    });

    socket.on('play', (delay = 2000) => {
      withRoom((room) => {
        if (!ensureHost('start playback')) return;

        const now = Date.now();
        const startAt = now + delay - room.playbackState.elapsed;
        room.playbackState.isPlaying = true;
        room.playbackState.startTime = startAt;

        room.clients.forEach((client) => {
          if (client.status === 'Ready') client.status = 'Playing';
        });
        broadcastClients();
        io.to(currentRoomId).emit('play', room.playbackState);
      });
    });

    socket.on('pause', () => {
      withRoom((room) => {
        if (!ensureHost('pause playback')) return;
        if (!room.playbackState.isPlaying) return;

        const now = Date.now();
        room.playbackState.elapsed = now - room.playbackState.startTime;
        room.playbackState.isPlaying = false;

        room.clients.forEach((client) => {
          if (client.status === 'Playing') client.status = 'Ready';
        });
        broadcastClients();
        io.to(currentRoomId).emit('pause');
      });
    });

    socket.on('seek', (seekTimeMs) => {
      withRoom((room) => {
        if (!ensureHost('seek playback')) return;

        const now = Date.now();
        room.playbackState.elapsed = seekTimeMs;
        room.playbackState.startTime = room.playbackState.isPlaying ? now - seekTimeMs : 0;
        io.to(currentRoomId).emit('seek', room.playbackState);
      });
    });

    socket.on('stop', () => {
      withRoom((room) => {
        if (!ensureHost('stop playback')) return;

        room.playbackState.isPlaying = false;
        room.playbackState.startTime = 0;
        room.playbackState.elapsed = 0;
        room.clients.forEach((client) => {
          client.status = 'Ready';
        });
        broadcastClients();
        io.to(currentRoomId).emit('stop');
      });
    });

    socket.on('control_device', ({ targetId, action, value }) => {
      withRoom((room) => {
        if (!ensureHost('control devices')) return;
        if (!room.clients.has(targetId)) return;
        io.to(targetId).emit('remote_control', { action, value });
      });
    });

    socket.on('assign_host', ({ targetId }) => {
      withRoom(() => {
        const result = roomStore.assignHost(currentRoomId, socket.id, targetId);
        if (!result.ok) {
          socket.emit('host_error', result.reason);
          return;
        }
        broadcastClients();
        io.to(currentRoomId).emit('host_changed', { hostId: targetId });
      });
    });

    socket.on('disconnect', () => {
      if (!currentRoomId) return;
      const { room } = roomStore.leaveRoom(currentRoomId, socket.id);
      if (room) {
        io.to(currentRoomId).emit('clients_update', roomStore.listClients(currentRoomId));
        io.to(currentRoomId).emit('host_changed', { hostId: room.currentHostId });
      }
    });
  });
};
