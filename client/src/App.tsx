import { useEffect, useMemo, useState } from 'react';
import { useZyncRoom } from './hooks/useZyncRoom';
import { ROOM_PATTERN } from './lib/room';
import { copyTextWithFallback } from './lib/share';
import { TopBar } from './components/TopBar';
import { RoomInviteCard } from './components/RoomInviteCard';
import { PlayerCard } from './components/PlayerCard';
import { ParticipantsCard } from './components/ParticipantsCard';
import './App.css';

function App() {
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [playlist, setPlaylist] = useState<File[]>([]);

  const room = useZyncRoom();
  const inviteLink = `${window.location.origin}/?room=${room.roomCode}`;
  const roomUptimeMs = Math.max(0, now - room.roomCreatedAt);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const formatTime = (ms: number) => {
    if (ms < 0) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const copyInviteLink = async () => {
    if (!ROOM_PATTERN.test(room.roomCode)) return;
    try {
      const copied = await copyTextWithFallback(inviteLink);
      if (!copied) throw new Error('copy failed');
      setCopiedInvite(true);
      room.setStatus('Invite copied');
      window.setTimeout(() => setCopiedInvite(false), 1400);
    } catch {
      window.prompt('Copy this invite link:', inviteLink);
      room.setStatus('Copy blocked, share link manually');
    }
  };

  const shareInvite = async () => {
    if (!ROOM_PATTERN.test(room.roomCode) || !navigator.share) return;
    try {
      await navigator.share({
        title: `Join Zync Room ${room.roomCode}`,
        text: `Join my room: ${room.roomCode}`,
        url: inviteLink,
      });
      room.setStatus('Invite shared');
    } catch {
      // share cancelled
    }
  };

  const activeHostName = room.activeHost?.name;
  const canShare = useMemo(() => 'share' in navigator, []);
  const canPlay = Boolean(room.audioName);

  const addTracks = (files: FileList) => {
    const onlyAudio = Array.from(files).filter((file) => file.type.startsWith('audio/'));
    if (onlyAudio.length === 0) {
      room.setStatus('Please choose audio files only');
      return;
    }
    setPlaylist((prev) => [...prev, ...onlyAudio]);
    room.setStatus(`${onlyAudio.length} track(s) added`);
  };

  return (
    <div className="container">
      {!room.isAudioEnabled && (
        <div className="overlay-vlc">
          <img src="/zync-logo.svg" alt="Zync" className="brand-logo" />
          <h2>Enable Audio</h2>
          <p>Tap once so this browser can play synchronized audio with near-zero drift.</p>
          <button onClick={room.enableAudio} className="primary-action">
            ENABLE AUDIO SYNC
          </button>
        </div>
      )}

      <TopBar
        connected={Boolean(room.socket?.connected)}
        clientsCount={room.clients.length}
        offset={room.offset}
        avgLatency={room.avgLatency}
        uptimeMs={roomUptimeMs}
      />

      <main className="layout">
        <section className="player-card">
          <RoomInviteCard
            roomCode={room.roomCode}
            inviteLink={inviteLink}
            copied={copiedInvite}
            onCopy={copyInviteLink}
            onShare={shareInvite}
            canShare={canShare}
          />

          <PlayerCard
            albumArt={room.albumArt}
            isPlaying={room.isPlaying}
            audioName={room.audioName}
            status={room.status}
            countdown={room.countdown}
            currentTime={room.currentTime}
            maxDuration={room.maxDuration}
            formatTime={formatTime}
            canControl={room.isCurrentHost}
            canPlay={canPlay}
            volume={room.volume}
            onSeek={room.seek}
            onStop={room.stop}
            onPlay={room.play}
            onPause={room.pause}
            onResync={room.resync}
            onVolume={room.setLocalVolume}
          />
        </section>

        <ParticipantsCard
          clients={room.clients}
          socketId={room.socket?.id}
          activeHostName={activeHostName}
          isCurrentHost={room.isCurrentHost}
          canClaimHost={room.canClaimHost && Boolean(room.socket?.connected) && room.isRoomJoined}
          onClaimHost={room.claimHost}
          onReleaseHost={room.releaseHost}
          onAssignHost={room.assignHost}
          onRemoteVolume={room.setRemoteVolume}
          onUploadTrack={room.uploadTrack}
          playlist={playlist}
          activeTrackName={room.audioName}
          onAddTracks={addTracks}
        />
      </main>
    </div>
  );
}

export default App;
