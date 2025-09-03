// Server for OX Game - For Render Deployment
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// CORS Configuration: This is very important!
const io = new Server(server, {
  cors: {
    // We will put your Netlify URL here later.
    // For now, you can put a placeholder.
    origin: "https://vaibhavoxgame.netlify.app", 
    methods: ["GET", "POST"]
  }
});

// Simple check to see if the server is running
app.get("/", (req, res) => {
    res.send("Server is running and ready for connections!");
});

let rooms = {};

const findRoomBySocketId = (socketId) => {
    return Object.keys(rooms).find(roomCode => rooms[roomCode]?.players.some(p => p.id === socketId));
};

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('createRoom', (playerName) => {
        let roomCode;
        do {
            roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        } while (rooms[roomCode]);

        rooms[roomCode] = {
            players: [{ id: socket.id, name: playerName, marker: 'X' }],
            board: Array(9).fill(null)
        };
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, playerMarker: 'X' });
        console.log(`Room ${roomCode} created by ${playerName}`);
    });

    socket.on('joinRoom', ({ roomCode, playerName }) => {
        const room = rooms[roomCode];
        if (room && room.players.length === 1) {
            room.players.push({ id: socket.id, name: playerName, marker: 'O' });
            socket.join(roomCode);
            io.to(roomCode).emit('gameStart', {
                playerX: room.players[0].name,
                playerO: room.players[1].name
            });
            console.log(`${playerName} joined room ${roomCode}`);
        } else {
            socket.emit('error', 'Room is full or does not exist.');
        }
    });

    socket.on('makeMove', ({ roomCode, index, playerMarker }) => {
        const room = rooms[roomCode];
        if (!room) return;
        room.board[index] = playerMarker;
        socket.to(roomCode).emit('moveMade', { index, playerMarker });
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        const roomCode = findRoomBySocketId(socket.id);
        if (roomCode) {
            socket.to(roomCode).emit('opponentLeft');
            delete rooms[roomCode];
            console.log(`Room ${roomCode} was closed.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);

});

