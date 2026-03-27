import { Crown, Laptop, Shield, Smartphone, Tablet, Upload, Volume2 } from 'lucide-react';
import type { ConnectedClient } from '../types';

interface ParticipantsCardProps {
  clients: ConnectedClient[];
  socketId?: string;
  activeHostName?: string;
  isCurrentHost: boolean;
  canClaimHost: boolean;
  audioName: string | null;
  onClaimHost: () => void;
  onReleaseHost: () => void;
  onAssignHost: (targetId: string) => void;
  onRemoteVolume: (targetId: string, value: number) => void;
  onUploadTrack: (file: File) => void;
}

const getDeviceIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('iphone') || n.includes('android')) return <Smartphone size={15} />;
  if (n.includes('mac') || n.includes('pc')) return <Laptop size={15} />;
  return <Tablet size={15} />;
};

export const ParticipantsCard = ({
  clients,
  socketId,
  activeHostName,
  isCurrentHost,
  canClaimHost,
  audioName,
  onClaimHost,
  onReleaseHost,
  onAssignHost,
  onRemoteVolume,
  onUploadTrack,
}: ParticipantsCardProps) => {
  return (
    <aside className="side-card">
      <div className="host-status">
        {isCurrentHost ? (
          <span className="chip gold">
            <Crown size={14} /> You are Host
          </span>
        ) : activeHostName ? (
          <span className="chip">
            <Shield size={14} /> Host: {activeHostName}
          </span>
        ) : (
          <span className="chip">No host assigned</span>
        )}

        {isCurrentHost ? (
          <button className="ghost-action danger" onClick={onReleaseHost}>
            Release Host
          </button>
        ) : (
          <button className="primary-action" onClick={onClaimHost} disabled={!canClaimHost}>
            Claim Host
          </button>
        )}
      </div>

      {isCurrentHost && (
        <label className="upload-btn">
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadTrack(file);
            }}
            hidden
          />
          <Upload size={16} /> {audioName ? 'Replace Track' : 'Upload Track'}
        </label>
      )}

      <div className="device-list">
        <h4>Connected Devices</h4>
        {clients.map((client) => (
          <div key={client.id} className={`device-item ${client.id === socketId ? 'self' : ''}`}>
            <div className="device-meta">
              <div className="device-main">
                <span className="device-icon">{getDeviceIcon(client.name)}</span>
                <span>
                  {client.name}
                  {client.id === socketId ? ' (You)' : ''}
                </span>
                {client.isHost && <span className="mini-badge">HOST</span>}
              </div>
              <span className="muted">
                {client.status} · {client.latency}ms
              </span>
            </div>
            <div className="device-vol">
              <Volume2 size={13} />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={client.volume}
                onChange={(e) => onRemoteVolume(client.id, parseFloat(e.target.value))}
                className="slider mini"
                disabled={!isCurrentHost}
              />
            </div>
            {isCurrentHost && client.id !== socketId && (
              <button className="mini-action" onClick={() => onAssignHost(client.id)}>
                Make Host
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
};
