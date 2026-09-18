const { Server } = require('socket.io');

let io = null;

const initSocketIO = (httpServer, clientOrigin) => {
  io = new Server(httpServer, {
    cors: {
      origin: clientOrigin || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Emit initial connection handshake event to verify Stage 1 connectivity
    socket.emit('system:connected', {
      success: true,
      message: 'Adaptive Civic Routing Real-time Gateway Connected',
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });

    socket.on('system:ping', (data) => {
      socket.emit('system:pong', {
        replyTo: data,
        serverTime: new Date().toISOString()
      });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected (${socket.id}): ${reason}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized yet!');
  }
  return io;
};

module.exports = {
  initSocketIO,
  getIO
};
