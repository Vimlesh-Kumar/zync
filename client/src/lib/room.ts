export const ROOM_PATTERN = /^[A-Z0-9]{6,12}$/;

export const getRequestedRoomCode = () => {
  const value = new URLSearchParams(window.location.search).get('room') || '';
  const normalized = value.toUpperCase().trim();
  return ROOM_PATTERN.test(normalized) ? normalized : '';
};

export const generateRoomCode = () => Math.floor(100000 + Math.random() * 900000).toString();

export const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
