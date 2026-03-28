import { Clock, Gauge, Users, Wifi } from 'lucide-react';
import { formatDuration } from '../lib/room';

interface TopBarProps {
  connected: boolean;
  clientsCount: number;
  offset: number;
  avgLatency: number;
  uptimeMs: number;
}

export const TopBar = ({ connected, clientsCount, offset, avgLatency, uptimeMs }: TopBarProps) => {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <img src="/zync-logo.svg" alt="Zync Logo" className="brand-logo" />
        <div className="brand-text">
          <h1>zync live room</h1>
          <span>zero-latency sync engine</span>
        </div>
      </div>

      <div className="header-meta">
        <span className={`chip ${connected ? 'ok' : 'bad'}`}>
          <Wifi size={14} /> {connected ? 'Connected' : 'Offline'}
        </span>
        <span className="chip">
          <Users size={14} /> {clientsCount} devices
        </span>
        <span className="chip">
          <Clock size={14} /> {offset.toFixed(0)}ms offset
        </span>
        <span className="chip">
          <Gauge size={14} /> {avgLatency.toFixed(0)}ms avg ping
        </span>
        <span className="chip">{formatDuration(uptimeMs)} room uptime</span>
      </div>
    </header>
  );
};
