// FINAL SERVER CODE - With Rematch and Timer Logic
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://vaibhavoxgame.netlify.app",
    methods: ["GET", "POST"]
  }
});

app.get("/", (req, res) => {
    res.send("Server is running and ready for connections!");
});

let rooms = {};
let timers = {}; 

const findRoomBySocketId = (socketId) => {
    return Object.keys(rooms).find(roomCode => rooms[roomCode]?.players.some(p => p.id === socketId));
};

const startTurnTimer = (roomCode) => {
    if (timers[roomCode]) clearInterval(timers[roomCode]);

    let seconds = 30;
    const room = rooms[roomCode];
    if (!room || room.players.length < 2) return;
    
    io.to(roomCode).emit('timerTick', seconds);

    timers[roomCode] = setInterval(() => {
        seconds--;
        io.to(roomCode).emit('timerTick', seconds);

        if (seconds <= 0) {
            clearInterval(timers[roomCode]);
            room.currentPlayerMarker = room.currentPlayerMarker === 'X' ? 'O' : 'X';
            io.to(roomCode).emit('turnSkipped', room.currentPlayerMarker);
            startTurnTimer(roomCode);
        }
    }, 1000);
};

const stopTurnTimer = (roomCode) => {
    if (timers[roomCode]) clearInterval(timers[roomCode]);
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
            currentPlayerMarker: 'X',
            rematchVotes: []
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
        } else {
            socket.emit('error', 'Room is full or does not exist.');
        }
    });

    socket.on('makeMove', ({ roomCode, index, playerMarker }) => {
        const room = rooms[roomCode];
        if (!room || room.board[index] !== null || playerMarker !== room.currentPlayerMarker) return;
        
        stopTurnTimer(roomCode);
        
        room.board[index] = playerMarker;
        room.currentPlayerMarker = playerMarker === 'X' ? 'O' : 'X';
        
        io.to(roomCode).emit('moveMade', { index, playerMarker, nextTurn: room.currentPlayerMarker });
        
        // Don't start timer if game is over
        const winner = checkWinner(room.board); // Simple winner check on server
        if (!winner) {
            startTurnTimer(roomCode);
        } else {
            io.to(roomCode).emit('gameOver');
        }
    });

    // REMATCH LOGIC
    socket.on('requestRematch', (roomCode) => {
        const room = rooms[roomCode];
        if (!room) return;

        if (!room.rematchVotes.includes(socket.id)) {
            room.rematchVotes.push(socket.id);
        }

        if (room.rematchVotes.length === 2) {
            // Both players agreed to a rematch
            room.board = Array(9).fill(null);
            room.currentPlayerMarker = 'X';
            room.rematchVotes = [];
            io.to(roomCode).emit('newRoundStarted');
            startTurnTimer(roomCode);
        } else {
            // Inform players that one player is waiting
            io.to(roomCode).emit('waitingForRematch');
        }
    });

    socket.on('disconnect', () => {
        const roomCode = findRoomBySocketId(socket.id);
        if (roomCode) {
            stopTurnTimer(roomCode);
            socket.to(roomCode).emit('opponentLeft');
            delete rooms[roomCode];
            delete timers[roomCode];
        }
        console.log(`Player disconnected: ${socket.id}`);
    });
});

// Helper function for server to know when to stop timer
function checkWinner(board) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (let line of lines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a]; 
        }
    }
    if (board.every(cell => cell)) return 'draw';
    return null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
