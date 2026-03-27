import { Music, Pause, Play, RotateCw, Square, Volume2, VolumeX } from 'lucide-react';

interface PlayerCardProps {
  albumArt: string | null;
  isPlaying: boolean;
  audioName: string | null;
  status: string;
  countdown: number | null;
  currentTime: number;
  maxDuration: number;
  formatTime: (ms: number) => string;
  canControl: boolean;
  canPlay: boolean;
  volume: number;
  onSeek: (value: number) => void;
  onStop: () => void;
  onPlay: () => void;
  onPause: () => void;
  onResync: () => void;
  onVolume: (value: number) => void;
}

export const PlayerCard = ({
  albumArt,
  isPlaying,
  audioName,
  status,
  countdown,
  currentTime,
  maxDuration,
  formatTime,
  canControl,
  canPlay,
  volume,
  onSeek,
  onStop,
  onPlay,
  onPause,
  onResync,
  onVolume,
}: PlayerCardProps) => {
  return (
    <>
      <div className="album-art-wrap">
        {albumArt ? (
          <img src={albumArt} alt="Album Art" className={`album-art-img ${isPlaying ? 'playing' : ''}`} />
        ) : (
          <Music size={110} className={isPlaying ? 'icon-pulse' : ''} />
        )}
      </div>

      <div className="track-info">
        <h3>{audioName || 'No Track Selected'}</h3>
        <p>{countdown !== null && countdown > 0 ? `Starting in ${(countdown / 1000).toFixed(1)}s` : status}</p>
      </div>

      <div className="progress-section">
        <input
          type="range"
          min="0"
          max={maxDuration}
          value={currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="slider"
          disabled={!canControl || !audioName}
        />
        <div className="time-row">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(maxDuration)}</span>
        </div>
      </div>

      <div className="controls">
        {canControl ? (
          <>
            <button onClick={onStop} className="icon-btn" disabled={!canPlay}>
              <Square size={24} />
            </button>
            <button onClick={isPlaying ? onPause : onPlay} className="icon-btn primary" disabled={!canPlay}>
              {isPlaying ? <Pause size={34} /> : <Play size={34} />}
            </button>
            <button onClick={onResync} className="icon-btn">
              <RotateCw size={22} />
            </button>
          </>
        ) : (
          <button onClick={onResync} className="ghost-action wide">
            <RotateCw size={16} />
            Resync Offset
          </button>
        )}
      </div>

      <div className="volume-row">
        {volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
        <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => onVolume(parseFloat(e.target.value))} className="slider" />
      </div>
    </>
  );
};
