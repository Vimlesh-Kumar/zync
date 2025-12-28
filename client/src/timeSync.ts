import { Socket } from 'socket.io-client';

export class TimeSync {
    socket: Socket;
    serverOffset: number = 0; // serverTime = localTime + offset

    constructor(socket: Socket) {
        this.socket = socket;
    }

    async sync() {
        const ITERATIONS = 20;
        const results: { offset: number; roundTrip: number }[] = [];

        for (let i = 0; i < ITERATIONS; i++) {
            const t1 = Date.now();
            await new Promise<void>((resolve) => {
                this.socket.emit('timesync', t1, (serverTime: number, clientSendTime: number) => {
                    const t3 = Date.now();
                    const roundTrip = t3 - clientSendTime;
                    const latency = roundTrip / 2;
                    const estimatedServerTimeAtReceive = serverTime + latency;
                    const offset = estimatedServerTimeAtReceive - t3;
                    results.push({ offset, roundTrip });
                    resolve();
                });
            });
            await new Promise(r => setTimeout(r, 20));
        }

        // Sort by RTT (lowest latency is best predictor)
        results.sort((a, b) => a.roundTrip - b.roundTrip);

        // Take best 5
        const best = results.slice(0, 5);

        // Calculate standard deviation of offsets to see network stability
        const offsets = best.map(r => r.offset);
        const avg = offsets.reduce((a, b) => a + b, 0) / offsets.length;

        // Use average of filtered best results
        this.serverOffset = avg;
        console.log(`Time synced. Offset: ${this.serverOffset.toFixed(2)}ms. Best RTT: ${best[0].roundTrip}ms`);
        return this.serverOffset;
    }

    getEstimatedServerTime() {
        return Date.now() + this.serverOffset;
    }
}
