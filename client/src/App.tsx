import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { TimeSync } from './timeSync';
import { AudioEngine } from './audioEngine';
import { 
    Play, Pause, Square, Radio, Upload, RotateCw, Music, Monitor, 
    Smartphone, Laptop, Tablet, Volume2, VolumeX, Users, Clock
} from 'lucide-react';
import './App.css';

const SERVER_URL = `http://${window.location.hostname}:3000`;

interface ConnectedClient {
    id: string;
    name: string;
    isHost: boolean;
    volume: number;
    status: string;
    latency: number;
}

function App() {
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
  const [showDevices, setShowDevices] = useState<boolean>(false);

  const timeSyncRef = useRef<TimeSync | null>(null);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  
  // Timer Loop for Progress Bar
  useEffect(() => {
    let animationFrame: number;
    const update = () => {
        if (isPlaying && sessionStartTime > 0 && timeSyncRef.current) {
            const serverTime = timeSyncRef.current.getEstimatedServerTime();
            const diff = serverTime - sessionStartTime;
            setCurrentTime(diff);
        }
        animationFrame = requestAnimationFrame(update);
    };
    animationFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, sessionStartTime]);
  
  useEffect(() => {
    const s = io(SERVER_URL);
    setSocket(s);
    
    timeSyncRef.current = new TimeSync(s);
    audioEngineRef.current = new AudioEngine();

    // Identify device for server
    const getDeviceName = () => {
        const ua = navigator.userAgent;
        if (/iPad|iPhone|iPod/.test(ua)) return "iPhone/iPad";
        if (/Android/.test(ua)) return "Android Device";
        if (/Macintosh/.test(ua)) return "Mac";
        if (/Windows/.test(ua)) return "PC";
        return "Unknown Device";
    };

    s.on('connect', () => {
      setStatus('Online');
      timeSyncRef.current?.sync().then((off) => {
        setOffset(off);
      });
      
      // Send initial identity
      s.emit('update_identity', {
          name: getDeviceName(),
          isHost: isHost,
          volume: volume,
          status: 'Online'
      });
    });

    s.on('clients_update', (updatedClients: ConnectedClient[]) => {
        setClients(updatedClients);
    });

    s.on('remote_control', ({ action, value }: { action: string, value: any }) => {
        if (action === 'set_volume') {
            setVolume(value);
            audioEngineRef.current?.setVolume(value);
            // Sync back to server so host knows it applied
            s.emit('update_identity', { volume: value });
        }
    });

    // Handle host denial/correction
    s.on('identity_corrected', ({ isHost: validatedStatus }) => {
         if (isHost !== validatedStatus) {
             setIsHost(validatedStatus);
         }
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
        if (state.isPlaying) {
            setIsPlaying(true);
            setSessionStartTime(state.startTime);
            
             const waitAndPlay = async () => {
                let attempts = 0;
                while(attempts < 100) {
                    if (timeSyncRef.current?.serverOffset !== 0 && audioEngineRef.current?.buffer) break;
                    await new Promise(r => setTimeout(r, 100));
                    attempts++;
                }
                audioEngineRef.current?.play(state.startTime, timeSyncRef.current!.serverOffset);
                setStatus(`Sync Active`);
                s.emit('update_identity', { status: 'Playing' });
            };
            waitAndPlay();
        }
    });

    s.on('audio_available', ({ name }: { name: string }) => {
      setStatus(`Downloading...`);
      setAudioName(name);
      s.emit('update_identity', { status: 'Downloading' });
      
      s.emit('request_audio', async (data: any) => {
        if (data && data.buffer) {
          try {
            await audioEngineRef.current?.load(data.buffer, data.type);
            // Extract album art
            audioEngineRef.current?.getAlbumArt(data.buffer).then((url) => setAlbumArt(url));
            setStatus(`Ready`);
            s.emit('update_identity', { status: 'Ready' });
          } catch (e) {
            console.error("Load error:", e);
            setStatus('Format Error');
          }
        }
      });
    });

    s.on('play', ({ startTime }: { startTime: number }) => {
      setIsPlaying(true);
      setSessionStartTime(startTime);
      
      const waitAndPlay = async () => {
          let attempts = 0;
          while (attempts < 200) { 
              if (timeSyncRef.current?.serverOffset !== 0 && audioEngineRef.current?.buffer) break;
              await new Promise(r => setTimeout(r, 100));
              attempts++;
          }
          if (audioEngineRef.current?.buffer) {
              audioEngineRef.current.play(startTime, timeSyncRef.current!.serverOffset);
              setStatus(`Playing`);
              s.emit('update_identity', { status: 'Playing' });
              
              // Update Media Session for Lock Screen
              if ('mediaSession' in navigator) {
                  navigator.mediaSession.metadata = new MediaMetadata({
                      title: audioName || 'Vim Sync Track',
                      artist: 'Zync',
                      artwork: albumArt ? [{ src: albumArt, sizes: '512x512', type: 'image/png' }] : []
                  });
                  
                  navigator.mediaSession.setActionHandler('play', () => { s.emit('play', 0); });
                  navigator.mediaSession.setActionHandler('pause', () => { s.emit('pause'); });
                  navigator.mediaSession.setActionHandler('stop', () => { s.emit('stop'); });
                  navigator.mediaSession.setActionHandler('seekto', (details) => {
                       if (details.seekTime !== undefined) s.emit('seek', details.seekTime * 1000); 
                  });
              }
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
      setIsPlaying(false);
      setStatus(`Stopped`);
      s.emit('update_identity', { status: 'Ready' });
      audioEngineRef.current?.stop();
    });
    
    s.on('pause', () => {
        setIsPlaying(false);
        setStatus('Paused');
        s.emit('update_identity', { status: 'Ready' });
        audioEngineRef.current?.stop();
    });

    return () => {
      ctx.removeEventListener('statechange', handleStateChange);
      s.disconnect();
    };
  }, []);

  // Update server when isHost changes
  useEffect(() => {
    socket?.emit('update_identity', { isHost });
    if (isHost && window.innerWidth > 900) {
        setShowDevices(true);
    }
  }, [isHost, socket]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket) return;
    setStatus(`Uploading...`);
    const buffer = await file.arrayBuffer();
    socket.emit('upload_audio', { name: file.name, type: file.type, buffer: buffer });
    audioEngineRef.current?.load(buffer, file.type);
    audioEngineRef.current?.getAlbumArt(buffer).then((url) => setAlbumArt(url));
    setAudioName(file.name);
    setStatus('Ready to Sync');
  };

  const handlPlayClick = () => {
    socket?.emit('play', 2000); 
  };
  
  const handlePauseClick = () => {
    socket?.emit('pause');
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!socket || !audioEngineRef.current?.buffer) return;
    const seekTime = Number(e.target.value);
    setCurrentTime(seekTime);
    socket.emit('seek', seekTime);
  };

  const handleStopClick = () => {
    socket?.emit('stop');
  };

  const handleManualSync = () => {
      timeSyncRef.current?.sync().then(off => setOffset(off));
  };

  const formatTime = (ms: number) => {
    if (ms < 0) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const enableAudio = async () => {
    if (audioEngineRef.current) {
        const success = await audioEngineRef.current.resumeContext();
        if (success) {
            setIsAudioEnabled(true);
            setStatus("Ready");
            
            // If already playing, start audio engine immediately
            if (isPlaying && sessionStartTime > 0 && timeSyncRef.current) {
                audioEngineRef.current.play(sessionStartTime, timeSyncRef.current.serverOffset);
            }
        } else {
            setStatus("Context Error");
        }
    }
  };

  const handleLocalVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setVolume(val);
      audioEngineRef.current?.setVolume(val);
      socket?.emit('update_identity', { volume: val });
  };

  const handleRemoteVolumeChange = (targetId: string, val: number) => {
      socket?.emit('control_device', {
          targetId,
          action: 'set_volume',
          value: val
      });
  };

  const getDeviceIcon = (name: string) => {
      const n = name.toLowerCase();
      if (n.includes('iphone') || n.includes('android')) return <Smartphone size={16} />;
      if (n.includes('mac') || n.includes('pc')) return <Laptop size={16} />;
      return <Tablet size={16} />;
  };

  const maxDuration = audioEngineRef.current?.buffer?.duration 
    ? audioEngineRef.current.buffer.duration * 1000 
    : 0;

  // Screen Wake Lock
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await (navigator as any).wakeLock.request('screen');
                console.log('Wake Lock active');
            }
        } catch (err) {
            console.error(err);
        }
    };
    
    // Request on mount/interaction
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

  // Determine if another host controls the session
  const activeHostName = clients.find(c => c.isHost && c.id !== socket?.id)?.name;

  return (
    <div className="container">
      {!isAudioEnabled && (
          <div className="overlay-vlc">
              <img src="/zync-logo.svg" alt="Zync" className="brand-logo" />
              <h2>Zync</h2>
              <p className="overlay-tagline">In sync.</p>
              <p>Mobile browsers require permission to play audio.</p>
              <button onClick={enableAudio} className="vlc-btn-large">
                  ENABLE AUDIO SYNC
              </button>
              <p style={{marginTop: '2rem', fontSize: '0.8rem', opacity: 0.5}}>
                  Make sure your volume is up!
              </p>
          </div>
      )}

      <header>
        <div className="header-left">
            <div className="brand-lockup">
                <img src="/zync-logo.svg" alt="Zync Logo" className="brand-logo" />
                <div className="brand-text">
                    <h1>zync</h1>
                    <span className="brand-tagline">In sync.</span>
                </div>
            </div>
        </div>

        <div className="status-bar">
            {activeHostName && (
                <span className="pill green host-indicator">
                   Managed by {activeHostName}
                </span>
            )}
            <span className={`pill ${socket?.connected ? 'green' : 'red'}`}>
                {socket?.connected ? 'Online' : 'Offline'}
            </span>
            <span className="pill blue">
                <Clock size={12} /> {offset.toFixed(0)}ms
            </span>
        </div>
        
        <div className="header-right">
             {!activeHostName && (
                <label className={`host-toggle-mini ${isHost ? 'active' : ''}`}>
                    <input type="checkbox" checked={isHost} onChange={e => setIsHost(e.target.checked)} />
                    {isHost ? <Monitor size={16} /> : <Radio size={16} />}
                    <span>{isHost ? "Host Active" : "Be Host"}</span>
                </label>
             )}

            {isHost && (
                <button 
                    className={`devices-toggle ${showDevices ? 'active' : ''}`}
                    onClick={() => setShowDevices(!showDevices)}
                >
                    <Users size={18} />
                    <span>{clients.length}</span>
                </button>
            )}
        </div>
      </header>

      <main>

        <div className={`player-layout ${isHost && showDevices ? 'split-view' : ''}`}>
            <div className="player-core">
                <div className="album-art-wrap">
                    {albumArt ? (
                        <img src={albumArt} alt="Album Art" className={`album-art-img ${isPlaying ? "playing" : ""}`} />
                    ) : (
                        <Music size={120} className={isPlaying ? "icon-pulse" : ""} />
                    )}
                </div>
                
                <div className="track-info">
                    <h2 className="track-title">{audioName || "No Track Selected"}</h2>
                    <div className="track-status">
                        {countdown !== null && countdown > 0 
                            ? `Starting in ${(countdown/1000).toFixed(1)}s` 
                            : status}
                    </div>
                    
                    <div className="vlc-visualizer">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className={`vlc-bar ${isPlaying ? 'anim' : ''}`} />
                        ))}
                    </div>
                </div>

                <div className="progress-section">
                    <input 
                        type="range" 
                        min="0" 
                        max={maxDuration} 
                        value={currentTime} 
                        onChange={handleSeek}
                        className="vlc-slider"
                        disabled={!isHost || !audioName} 
                    />
                    <div className="time-row">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(maxDuration)}</span>
                    </div>
                </div>

                <div className="local-volume-control">
                    {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.01" 
                        value={volume} 
                        onChange={handleLocalVolumeChange}
                        className="vlc-slider volume"
                    />
                </div>
            </div>

            {isHost && showDevices && (
                <div className="devices-panel">
                    <div className="panel-header">
                        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                            <Users size={18} />
                            <h3>Device Management</h3>
                        </div>
                        <span className="device-count">{clients.length - 1} connected</span>
                    </div>
                    <div className="device-list">
                        {[...clients].sort((a, b) => (a.isHost === b.isHost ? 0 : a.isHost ? -1 : 1)).map(client => (
                            <div key={client.id} className={`device-item ${client.id === socket?.id ? 'current-device' : ''}`}>
                                <div className="device-info">
                                    <div className="device-name-wrap">
                                        <div className="device-name">
                                            <div className="device-icon-box">
                                                {getDeviceIcon(client.name)}
                                            </div>
                                            <span>
                                                {client.name}
                                                {client.id === socket?.id && " (You)"}
                                            </span>
                                            {client.isHost && <span className="host-badge">HOST</span>}
                                        </div>
                                        <div className="device-meta">
                                            <div className="status-indicator">
                                                <span className={`status-dot ${client.status.toLowerCase()}`}></span>
                                                {client.status}
                                            </div>
                                            <span className="latency-badge">{client.latency}ms</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="device-controls">
                                    <Volume2 size={14} />
                                    <input 
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={client.volume}
                                        onChange={(e) => handleRemoteVolumeChange(client.id, parseFloat(e.target.value))}
                                        className="vlc-slider mini"
                                    />
                                </div>
                            </div>
                        ))}
                        {clients.length <= 1 && (
                            <div className="no-devices">
                                <Users size={40} opacity={0.2} />
                                <p>Waiting for other devices to join...</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
      </main>

      <div className="bottom-controls">
          <div className="playback-btns">
              {isHost ? (
                  <>
                    <button onClick={handleStopClick} className="p-btn" disabled={!audioName}>
                        <Square size={28} fill="white" />
                    </button>
                    {isPlaying ? (
                        <button onClick={handlePauseClick} className="p-btn play-pause">
                            <Pause size={38} fill="white" />
                        </button>
                    ) : (
                        <button onClick={handlPlayClick} className="p-btn play-pause" disabled={!audioName}>
                            <Play size={38} fill="white" />
                        </button>
                    )}
                    <button onClick={handleManualSync} className="p-btn">
                        <RotateCw size={28} />
                    </button>
                  </>
              ) : (
                  <div className="client-controls-view">
                      <div className="client-btn-row">
                        <button onClick={handleManualSync} className="vlc-btn-small">
                            RESYNC
                        </button>
                        <button onClick={() => audioEngineRef.current?.resumeContext(false)} className="vlc-btn-small secondary">
                            TEST BEEP
                        </button>
                      </div>
                      <p className="client-hint">
                          Keep this tab open for sync to work.
                      </p>
                  </div>
              )}
          </div>

          {isHost && (
              <div className="host-panel">
                 <label className="upload-btn">
                    <input type="file" accept="audio/*" onChange={handleFileUpload} hidden />
                    <Upload size={18} /> {audioName ? "Change Track" : "Upload Track"}
                 </label>
              </div>
          )}
      </div>

      <footer>
        Zync • {clients.length} device{clients.length !== 1 ? 's' : ''} connected
      </footer>
    </div>
  );
}

export default App;
