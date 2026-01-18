import { getLeaderboard, getScores } from './db.js';

export function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send initial data on connection
    socket.emit('leaderboard', getLeaderboard());
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}

// Broadcast functions to be called from routes
export function broadcastScoreUpdate(io, score) {
  io.emit('score:new', score);
  io.emit('leaderboard', getLeaderboard());
}

export function broadcastCompetitorUpdate(io) {
  io.emit('leaderboard', getLeaderboard());
}
