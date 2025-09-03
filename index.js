// FINAL SERVER CODE - With Debugging Logs
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://vaibhavoxgame.netlify.app", // Your Netlify URL
    methods: ["GET", "POST"]
  }
});

app.get("/", (req, res) => {
    res.send("Server is running and ready for connections!");
});

let rooms = {};

io.on('connection', (socket) => {
    console.log(`[EVENT] Player connected: ${socket.id}`);

    socket.on('createRoom', (playerName) => {
        console.log(`[EVENT] createRoom received from: ${playerName} (${socket.id})`);
        let roomCode;
        do {
            roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        } while (rooms[roomCode]);

        rooms[roomCode] = {
            players: [{ id: socket.id, name: playerName, marker: 'X' }],
            board: Array(9).fill(null),
            currentPlayerMarker: 'X'
        };
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, playerMarker: 'X' });
        console.log(`[SUCCESS] Room ${roomCode} created by ${playerName}`);
    });

    socket.on('joinRoom', ({ roomCode, playerName }) => {
        console.log(`[EVENT] joinRoom received for room ${roomCode} from: ${playerName} (${socket.id})`);
        const room = rooms[roomCode];
        if (room && room.players.length === 1) {
            room.players.push({ id: socket.id, name: playerName, marker: 'O' });
            socket.join(roomCode);
            io.to(roomCode).emit('gameStart', {
                playerX: room.players[0].name,
                playerO: room.players[1].name
            });
            console.log(`[SUCCESS] ${playerName} joined room ${roomCode}. Emitting gameStart.`);
        } else {
            socket.emit('error', 'Room is full or does not exist.');
            console.log(`[FAIL] Join failed for room ${roomCode}.`);
        }
    });

    socket.on('makeMove', ({ roomCode, index, playerMarker }) => {
        console.log(`[EVENT] makeMove received for room ${roomCode} from player ${playerMarker} for index ${index}`);
        const room = rooms[roomCode];
        if (!room || room.board[index] !== null || playerMarker !== room.currentPlayerMarker) {
            console.log(`[FAIL] Invalid move for room ${roomCode}.`);
            return;
        }
        
        room.board[index] = playerMarker;
        room.currentPlayerMarker = playerMarker === 'X' ? 'O' : 'X';
        
        io.to(roomCode).emit('moveMade', { index, playerMarker, nextTurn: room.currentPlayerMarker });
        console.log(`[SUCCESS] Broadcasting move to everyone in room ${roomCode}. Next turn: ${room.currentPlayerMarker}`);
    });
    
    // Other events...
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
