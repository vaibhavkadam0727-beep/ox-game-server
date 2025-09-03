// FINAL SERVER CODE - With Move Broadcasting Fix
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

// Simple check to see if the server is running
app.get("/", (req, res) => {
    res.send("Server is running and ready for connections!");
});

let rooms = {};
let timers = {}; // To store timers for each room

const findRoomBySocketId = (socketId) => {
    return Object.keys(rooms).find(roomCode => rooms[roomCode]?.players.some(p => p.id === socketId));
};

const startTurnTimer = (roomCode) => {
    if (timers[roomCode]) {
        clearInterval(timers[roomCode]);
    }

    let seconds = 30;
    const room = rooms[roomCode];
    if (!room) return;
    
    io.to(roomCode).emit('timerTick', seconds); // Send initial time

    timers[roomCode] = setInterval(() => {
        seconds--;
        io.to(roomCode).emit('timerTick', seconds);

        if (seconds <= 0) {
            clearInterval(timers[roomCode]);
            room.currentPlayerMarker = room.currentPlayerMarker === 'X' ? 'O' : 'X';
            io.to(roomCode).emit('turnSkipped', room.currentPlayerMarker);
            startTurnTimer(roomCode); // Restart timer for the next player
        }
    }, 1000);
};

const stopTurnTimer = (roomCode) => {
    if (timers[roomCode]) {
        clearInterval(timers[roomCode]);
    }
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
            board: Array(9).fill(null),
            currentPlayerMarker: 'X'
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
            startTurnTimer(roomCode);
            console.log(`${playerName} joined room ${roomCode}`);
        } else {
            socket.emit('error', 'Room is full or does not exist.');
        }
    });

    socket.on('makeMove', ({ roomCode, index, playerMarker }) => {
        const room = rooms[roomCode];
        if (!room || room.board[index] !== null || playerMarker !== room.currentPlayerMarker) return;
        
        stopTurnTimer(roomCode); // Stop timer on successful move
        
        room.board[index] = playerMarker;
        room.currentPlayerMarker = playerMarker === 'X' ? 'O' : 'X';

        // *** THIS IS THE FIX ***
        // Changed socket.to(...) to io.to(...) to send the move to EVERYONE in the room.
        io.to(roomCode).emit('moveMade', { index, playerMarker, nextTurn: room.currentPlayerMarker });
        
        startTurnTimer(roomCode); // Start timer for the next player
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        const roomCode = findRoomBySocketId(socket.id);
        if (roomCode) {
            stopTurnTimer(roomCode);
            socket.to(roomCode).emit('opponentLeft');
            delete rooms[roomCode];
            delete timers[roomCode];
            console.log(`Room ${roomCode} was closed.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
