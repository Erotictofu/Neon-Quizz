const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');
const path = require('path');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let players = {};
let currentQuestion = null;
let timeLeft = 15;
let timerInterval = null;
let gameStarted = false;
let questionCount = 0;
const MAX_QUESTIONS = 50;

async function chargerNouvelleQuestion() {
    if (questionCount >= MAX_QUESTIONS) {
        terminerPartie();
        return;
    }
    try {
        const response = await axios.get('https://the-trivia-api.com/v2/questions?limit=1');
        const q = response.data[0];
        questionCount++;
        currentQuestion = {
            text: q.question.text,
            choices: [...q.incorrectAnswers, q.correctAnswer].sort(() => Math.random() - 0.5),
            correct: q.correctAnswer,
            number: questionCount,
            startTime: Date.now()
        };
        timeLeft = 15;
        io.emit('nextQuestion', currentQuestion);
        startTimer();
    } catch (error) {
        setTimeout(chargerNouvelleQuestion, 2000);
    }
}

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        io.emit('timerUpdate', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            io.emit('timeUp', currentQuestion.correct);
            setTimeout(chargerNouvelleQuestion, 4000);
        }
    }, 1000);
}

function terminerPartie() {
    gameStarted = false;
    const sorted = Object.values(players).sort((a, b) => b.score - a.score);
    io.emit('gameOver', { winner: sorted[0]?.username || "Inconnu", leaderboard: sorted });
    questionCount = 0;
    Object.keys(players).forEach(id => { players[id].ready = false; players[id].score = 0; players[id].streak = 0; });
}

io.on('connection', (socket) => {
    socket.on('joinGame', (username) => {
        players[socket.id] = { username, score: 0, ready: false, streak: 0 };
        io.emit('updateLobby', Object.values(players));
    });

    socket.on('playerReady', () => {
        if (players[socket.id]) {
            players[socket.id].ready = true;
            const allPlayers = Object.values(players);
            io.emit('updateLobby', allPlayers);
            if (allPlayers.every(p => p.ready) && allPlayers.length > 0 && !gameStarted) {
                gameStarted = true;
                io.emit('gameStart');
                setTimeout(chargerNouvelleQuestion, 2000);
            }
        }
    });

    socket.on('submitAnswer', (data) => {
        const p = players[socket.id];
        if (p && gameStarted) {
            if (data.isCorrect) {
                const timeTaken = (Date.now() - currentQuestion.startTime) / 1000;
                let points = Math.round(150 + (Math.max(0, 15 - timeTaken) * 6.6)); // Bonus rapidité max +100
                p.streak++;
                if (p.streak >= 3) points = Math.round(points * 1.5); // Multiplicateur série
                p.score += points;
                socket.emit('feedback', { type: 'correct', points, streak: p.streak });
            } else {
                p.score = Math.max(0, p.score - 50);
                p.streak = 0;
                socket.emit('feedback', { type: 'wrong', points: -50, streak: 0 });
            }
            io.emit('updateLeaderboard', Object.values(players).sort((a, b) => b.score - a.score));
        }
    });

    socket.on('chatMessage', (msg) => {
        const p = players[socket.id];
        if (p) io.emit('newChatMessage', { user: p.username, text: msg });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updateLobby', Object.values(players));
    });
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, '0.0.0.0', () => console.log(`Serveur PRO actif sur ${PORT}`));
