const express = require("express");
const app = express();
const http = require("http");
const request = require("request"); // Import request for API requests
const cors = require("cors"); // Import CORS to handle cross-origin requests
const { Server } = require("socket.io");
const ACTIONS = require("./Actions");

const server = http.createServer(app);

// Setup socket.io
const io = new Server(server);

// Middleware to handle JSON and CORS
app.use(express.json());
app.use(cors()); // Apply CORS middleware

// In-memory storage for user sockets
const userSocketMap = {};

// Helper function to get all connected clients in a room
const getAllConnectedClients = (roomId) => {
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
    (socketId) => {
      return {
        socketId,
        username: userSocketMap[socketId],
      };
    }
  );
};

// Socket.io connection event
io.on("connection", (socket) => {
  socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
    userSocketMap[socket.id] = username;
    socket.join(roomId);
    const clients = getAllConnectedClients(roomId);
    // Notify all clients in the room about the new user
    clients.forEach(({ socketId }) => {
      io.to(socketId).emit(ACTIONS.JOINED, {
        clients,
        username,
        socketId: socket.id,
      });
    });
  });

  // Listen for code changes and broadcast to others
  socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  // Sync the code when a new user joins
  socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
    io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  // Handle disconnection and notify other clients
  socket.on("disconnecting", () => {
    const rooms = [...socket.rooms];
    rooms.forEach((roomId) => {
      socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username: userSocketMap[socket.id],
      });
    });
    delete userSocketMap[socket.id];
    socket.leave();
  });
});

// JDoodle API credentials (replace with your actual credentials)
const JDoodle_API_URL = "https://api.jdoodle.com/v1/execute";
const CLIENT_ID = "f00ae9dece81ff4d8ec46df2dbc95a20"; // Replace with your JDoodle client ID
const CLIENT_SECRET = "f93ae99b855942566defd382d903754db46973690fefad1c522b934ec198b341"; // Replace with your JDoodle client secret

// Route to handle code compilation
app.post("/compile", (req, res) => {
  const { script, stdin, language, versionIndex } = req.body;

  // Prepare the program object for the JDoodle API
  const program = {
    script: script,
    stdin: stdin || "", // Optional input
    language: language,
    versionIndex: versionIndex,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  };

  // Make a request to the JDoodle API
  request(
    {
      url: JDoodle_API_URL,
      method: "POST",
      json: program,
    },
    function (error, response, body) {
      if (error) {
        console.error("Error in JDoodle API request:", error);
        return res.status(500).json({ error: "Failed to compile code" });
      }
      // Log the response from the API
      console.log("statusCode:", response && response.statusCode);
      console.log("body:", body);
      
      // Send the API response back to the frontend
      res.json(body);
    }
  );
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
