import { io, Socket } from 'socket.io-client';
import type { LeaderboardEntry, Score } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      transports: ['websocket', 'polling']
    });
  }
  return socket;
}

export function onLeaderboardUpdate(callback: (data: LeaderboardEntry[]) => void): () => void {
  const s = getSocket();
  s.on('leaderboard', callback);
  return () => s.off('leaderboard', callback);
}

export function onScoreNew(callback: (score: Score) => void): () => void {
  const s = getSocket();
  s.on('score:new', callback);
  return () => s.off('score:new', callback);
}

export function disconnect(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
