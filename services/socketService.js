const { Server } = require("socket.io");

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*", // In production, replace with specific origins
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join a conversation room
    socket.on("join_conversation", (conversationId) => {
      socket.join(conversationId);
      console.log(`[SOCKET] User ${socket.id} joined room: ${conversationId}`);
    });

    // Handle typing events
    socket.on("typing", ({ conversationId, senderId }) => {
      console.log(`[SOCKET] User ${senderId} is typing in ${conversationId}`);
      socket.to(conversationId).emit("user_typing", { senderId });
    });

    socket.on("stop_typing", ({ conversationId, senderId }) => {
      socket.to(conversationId).emit("user_stop_typing", { senderId });
    });

    // Handle new messages
    socket.on("send_message", (messageData) => {
      const { conversationId, sender, text } = messageData;
      console.log(`[SOCKET] New message from ${sender} in room ${conversationId}: ${text?.substring(0, 20)}...`);
      
      if (conversationId) {
        socket.to(conversationId).emit("receive_message", messageData);
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

module.exports = { initSocket, getIO };
