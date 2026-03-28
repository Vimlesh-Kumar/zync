export interface ConnectedClient {
  id: string;
  name: string;
  isHost: boolean;
  volume: number;
  status: string;
  latency: number;
  joinedAt?: number;
}
