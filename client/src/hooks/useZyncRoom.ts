import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { TimeSync } from '../timeSync';
import { AudioEngine } from '../audioEngine';
import type { ConnectedClient } from '../types';
import { generateRoomCode, getRequestedRoomCode } from '../lib/room';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3000`;

export const useZyncRoom = () => {
  const initialRoomCode = getRequestedRoomCode() || generateRoomCode();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<string>('Connecting...');
  const [offset, setOffset] = useState<number>(0);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [albumArt, setAlbumArt] = useState<string | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [sessionStartTime, setSessionStartTime] = useState<number>(0);
  const [clients, setClients] = useState<ConnectedClient[]>([]);
  const [volume, setVolume] = useState<number>(1);
  const [roomCode, setRoomCode] = useState<string>(initialRoomCode);
  const [roomCreatedAt, setRoomCreatedAt] = useState<number>(Date.now());
  const [isRoomJoined, setIsRoomJoined] = useState<boolean>(false);

  const timeSyncRef = useRef<TimeSync | null>(null);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const hasEndedRef = useRef(false);

  useEffect(() => {
    let animationFrame: number;
    const update = () => {
      if (isPlaying && sessionStartTime > 0 && timeSyncRef.current) {
        const serverTime = timeSyncRef.current.getEstimatedServerTime();
        const nextTime = serverTime - sessionStartTime;
        const durationMs = audioEngineRef.current?.buffer?.duration ? audioEngineRef.current.buffer.duration * 1000 : 0;

        if (durationMs > 0 && nextTime >= durationMs) {
          setCurrentTime(durationMs);
          setIsPlaying(false);
          setStatus('Ended');
          audioEngineRef.current?.stop();

          if (!hasEndedRef.current) {
            hasEndedRef.current = true;
            if (isHost && socket?.connected) {
              socket.emit('stop');
            } else {
              socket?.emit('update_identity', { status: 'Ready' });
            }
          }
        } else {
          setCurrentTime(nextTime);
        }
      }
      animationFrame = requestAnimationFrame(update);
    };

    animationFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, sessionStartTime, isHost, socket]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('room') !== roomCode) {
      url.searchParams.set('room', roomCode);
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  useEffect(() => {
    const s = io(SERVER_URL);
    setSocket(s);
    timeSyncRef.current = new TimeSync(s);
    audioEngineRef.current = new AudioEngine();

    const getDeviceName = () => {
      const ua = navigator.userAgent;
      if (/iPad|iPhone|iPod/.test(ua)) return 'iPhone/iPad';
      if (/Android/.test(ua)) return 'Android Device';
      if (/Macintosh/.test(ua)) return 'Mac';
      if (/Windows/.test(ua)) return 'PC';
      return 'Unknown Device';
    };

    s.on('connect', () => {
      setStatus('Joining room...');
      const requestedRoom = roomCode;
      s.emit(
        'join_room',
        { roomId: requestedRoom },
        ({ roomId, isHost: serverHost, createdAt }: { roomId: string; isHost: boolean; createdAt: number }) => {
          const normalizedRoom = (roomId || requestedRoom).toUpperCase();
          setRoomCode(normalizedRoom);
          setRoomCreatedAt(createdAt || Date.now());
          setIsRoomJoined(true);
          setIsHost(Boolean(serverHost));
          setStatus('Online');
          timeSyncRef.current?.sync().then((off) => setOffset(off));

          s.emit('update_identity', {
            name: getDeviceName(),
            volume,
            status: 'Online',
          });
        },
      );
    });

    s.on('room_meta', ({ roomId, createdAt }: { roomId: string; createdAt: number }) => {
      if (roomId) setRoomCode(roomId);
      if (createdAt) setRoomCreatedAt(createdAt);
    });

    s.on('clients_update', (updatedClients: ConnectedClient[]) => {
      setClients(updatedClients);
    });

    s.on('host_changed', ({ hostId }: { hostId: string | null }) => {
      setIsHost(hostId === s.id);
    });

    s.on('host_error', (message: string) => {
      setStatus(message || 'Host permission required');
    });

    s.on('room_error', (message: string) => {
      setStatus(message || 'Room error');
    });

    s.on('remote_control', ({ action, value }: { action: string; value: any }) => {
      if (action === 'set_volume') {
        setVolume(value);
        audioEngineRef.current?.setVolume(value);
        s.emit('update_identity', { volume: value });
      }
    });

    s.on('identity_corrected', ({ isHost: validatedStatus }: { isHost: boolean }) => {
      setIsHost(validatedStatus);
    });

    if (audioEngineRef.current.ctx.state === 'running') {
      setIsAudioEnabled(true);
    }

    const handleStateChange = () => {
      if (audioEngineRef.current) {
        setIsAudioEnabled(audioEngineRef.current.ctx.state === 'running');
      }
    };

    const ctx = audioEngineRef.current.ctx;
    ctx.addEventListener('statechange', handleStateChange);

    s.on('playback_state', (state: any) => {
      if (!state.isPlaying) return;
      hasEndedRef.current = false;
      setIsPlaying(true);
      setSessionStartTime(state.startTime);

      const waitAndPlay = async () => {
        let attempts = 0;
        while (attempts < 100) {
          if (timeSyncRef.current?.serverOffset !== 0 && audioEngineRef.current?.buffer) break;
          await new Promise((r) => setTimeout(r, 100));
          attempts++;
        }
        audioEngineRef.current?.play(state.startTime, timeSyncRef.current!.serverOffset);
        setStatus('Sync Active');
        s.emit('update_identity', { status: 'Playing' });
      };
      waitAndPlay();
    });

    s.on('audio_available', ({ name }: { name: string }) => {
      setStatus('Downloading...');
      setAudioName(name);
      s.emit('update_identity', { status: 'Downloading' });

      s.emit('request_audio', async (data: any) => {
        if (!data || !data.buffer) return;
        try {
          await audioEngineRef.current?.load(data.buffer, data.type);
          audioEngineRef.current?.getAlbumArt(data.buffer).then((url) => setAlbumArt(url));
          setStatus('Ready');
          s.emit('update_identity', { status: 'Ready' });
        } catch (e) {
          console.error('Load error:', e);
          setStatus('Format Error');
        }
      });
    });

    s.on('play', ({ startTime }: { startTime: number }) => {
      hasEndedRef.current = false;
      setIsPlaying(true);
      setSessionStartTime(startTime);

      const waitAndPlay = async () => {
        let attempts = 0;
        while (attempts < 200) {
          if (timeSyncRef.current?.serverOffset !== 0 && audioEngineRef.current?.buffer) break;
          await new Promise((r) => setTimeout(r, 100));
          attempts++;
        }
        if (audioEngineRef.current?.buffer) {
          audioEngineRef.current.play(startTime, timeSyncRef.current!.serverOffset);
          setStatus('Playing');
          s.emit('update_identity', { status: 'Playing' });
        }
      };
      waitAndPlay();

      const serverTime = timeSyncRef.current?.getEstimatedServerTime() || Date.now();
      const delay = startTime - serverTime;
      if (delay > 0) {
        setCountdown(delay);
        const interval = setInterval(() => {
          const left = startTime - (timeSyncRef.current?.getEstimatedServerTime() || 0);
          if (left <= 0) {
            setCountdown(0);
            clearInterval(interval);
          } else {
            setCountdown(left);
          }
        }, 100);
      }
    });

    s.on('seek', (state: any) => {
      hasEndedRef.current = false;
      if (state.isPlaying) {
        setIsPlaying(true);
        setSessionStartTime(state.startTime);
        audioEngineRef.current?.play(state.startTime, timeSyncRef.current!.serverOffset);
      } else {
        setIsPlaying(false);
        setCurrentTime(state.elapsed);
      }
    });

    s.on('stop', () => {
      hasEndedRef.current = false;
      setIsPlaying(false);
      setStatus('Stopped');
      s.emit('update_identity', { status: 'Ready' });
      audioEngineRef.current?.stop();
    });

    s.on('pause', () => {
      hasEndedRef.current = false;
      setIsPlaying(false);
      setStatus('Paused');
      s.emit('update_identity', { status: 'Ready' });
      audioEngineRef.current?.stop();
    });

    return () => {
      ctx.removeEventListener('statechange', handleStateChange);
      s.disconnect();
    };
  }, [roomCode]);

  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {
        console.error(err);
      }
    };

    if (isAudioEnabled) requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isAudioEnabled) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (wakeLock) wakeLock.release();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAudioEnabled]);

  const activeHost = useMemo(() => clients.find((c) => c.isHost), [clients]);
  const isCurrentHost = Boolean(activeHost && activeHost.id === socket?.id && isHost);
  const canClaimHost = !activeHost || activeHost.id === socket?.id;
  const sortedClients = [...clients].sort((a, b) => (a.isHost === b.isHost ? 0 : a.isHost ? -1 : 1));
  const maxDuration = audioEngineRef.current?.buffer?.duration ? audioEngineRef.current.buffer.duration * 1000 : 0;
  const avgLatency = clients.length > 0 ? clients.reduce((sum, c) => sum + c.latency, 0) / clients.length : 0;

  const uploadTrack = async (file: File) => {
    if (!socket || !isCurrentHost) return;
    setStatus('Uploading...');
    const buffer = await file.arrayBuffer();
    socket.emit('upload_audio', { name: file.name, type: file.type, buffer });
    await audioEngineRef.current?.load(buffer, file.type);
    audioEngineRef.current?.getAlbumArt(buffer).then((url) => setAlbumArt(url));
    setAudioName(file.name);
    setStatus('Ready to Sync');
  };

  const play = () => socket?.emit('play', 2000);
  const pause = () => socket?.emit('pause');
  const stop = () => socket?.emit('stop');

  const seek = (value: number) => {
    if (!socket || !isCurrentHost) return;
    if (!audioEngineRef.current?.buffer) return;
    setCurrentTime(value);
    socket.emit('seek', value);
  };

  const resync = () => {
    timeSyncRef.current?.sync().then((off) => setOffset(off));
  };

  const claimHost = () => {
    socket?.emit('update_identity', { isHost: true });
    setStatus('Claiming host...');
  };

  const releaseHost = () => {
    socket?.emit('update_identity', { isHost: false });
    setStatus('Host released');
  };

  const assignHost = (targetId: string) => {
    socket?.emit('assign_host', { targetId });
    setStatus('Assigning host...');
  };

  const enableAudio = async () => {
    if (!audioEngineRef.current) return false;
    const success = await audioEngineRef.current.resumeContext();
    if (success) {
      setIsAudioEnabled(true);
      setStatus('Ready');
      if (isPlaying && sessionStartTime > 0 && timeSyncRef.current) {
        audioEngineRef.current.play(sessionStartTime, timeSyncRef.current.serverOffset);
      }
    } else {
      setStatus('Context Error');
    }
    return success;
  };

  const setLocalVolume = (val: number) => {
    setVolume(val);
    audioEngineRef.current?.setVolume(val);
    socket?.emit('update_identity', { volume: val });
  };

  const setRemoteVolume = (targetId: string, val: number) => {
    if (!isCurrentHost) return;
    socket?.emit('control_device', { targetId, action: 'set_volume', value: val });
  };

  return {
    socket,
    status,
    offset,
    audioName,
    albumArt,
    isPlaying,
    countdown,
    isAudioEnabled,
    currentTime,
    sessionStartTime,
    clients: sortedClients,
    volume,
    roomCode,
    roomCreatedAt,
    isRoomJoined,
    activeHost,
    isCurrentHost,
    canClaimHost,
    maxDuration,
    avgLatency,
    uploadTrack,
    play,
    pause,
    stop,
    seek,
    resync,
    claimHost,
    releaseHost,
    assignHost,
    enableAudio,
    setLocalVolume,
    setRemoteVolume,
    setStatus,
  };
};
