const { Server } = require('socket.io');
const { verifyToken } = require('./authService');

let io = null;

/**
 * Extracts JWT token from cookie string
 */
const parseCookieToken = (cookieString) => {
  if (!cookieString || typeof cookieString !== 'string') return null;
  const match = cookieString.match(/(?:^|;\s*)token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const initSocketIO = (httpServer, clientOrigin) => {
  io = new Server(httpServer, {
    cors: {
      origin: clientOrigin || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Socket.IO authentication middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || 
                    parseCookieToken(socket.handshake.headers?.cookie);

      if (token) {
        try {
          const user = verifyToken(token);
          socket.user = user;
        } catch (tokenErr) {
          socket.user = null;
        }
      } else {
        socket.user = null;
      }
    } catch (err) {
      socket.user = null;
    }
    next();
  });

  io.on('connection', (socket) => {
    // Role-based room assignment enforced server-side
    if (socket.user && (socket.user.role === 'OPERATOR' || socket.user.role === 'ADMIN')) {
      socket.join('privileged_operators');
      socket.join(`role:${socket.user.role}`);
    } else if (socket.user && socket.user.role === 'CITIZEN') {
      socket.join('role:CITIZEN');
    } else {
      socket.join('role:ANONYMOUS');
    }

    socket.emit('system:connected', {
      success: true,
      message: 'Adaptive Civic Routing Real-time Gateway Connected',
      socketId: socket.id,
      authenticated: !!socket.user,
      role: socket.user ? socket.user.role : 'ANONYMOUS',
      timestamp: new Date().toISOString()
    });

    socket.on('system:ping', (data) => {
      socket.emit('system:pong', {
        replyTo: data,
        serverTime: new Date().toISOString()
      });
    });

    socket.on('disconnect', (reason) => {
      // Disconnect handled cleanly
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
