import { Check, Copy, Send } from 'lucide-react';

interface RoomInviteCardProps {
  roomCode: string;
  inviteLink: string;
  copied: boolean;
  onCopy: () => void;
  onShare: () => void;
  canShare: boolean;
}

export const RoomInviteCard = ({ roomCode, inviteLink, copied, onCopy, onShare, canShare }: RoomInviteCardProps) => {
  return (
    <>
      <div className="room-head">
        <div>
          <p className="eyebrow">Room Code</p>
          <h2>{roomCode}</h2>
        </div>
        <div className="invite-actions">
          {canShare && (
            <button className="ghost-action" onClick={onShare}>
              <Send size={15} />
              Share
            </button>
          )}
          <button className="ghost-action" onClick={onCopy}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied' : 'Copy Invite'}
          </button>
        </div>
      </div>
      <div className="invite-link-wrap">
        <input className="invite-link" value={inviteLink} readOnly onFocus={(e) => e.target.select()} aria-label="Room invite link" />
        <p className="muted">Open this exact URL on another device to join the same room.</p>
      </div>
    </>
  );
};
