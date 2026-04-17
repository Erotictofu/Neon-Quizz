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
let timeLeft = 30;
let timerInterval = null;

async function chargerNouvelleQuestion() {
    try {
        const response = await axios.get('https://the-trivia-api.com/v2/questions?limit=1');
        const q = response.data[0];
        
        currentQuestion = {
            text: q.question.text,
            choices: [...q.incorrectAnswers, q.correctAnswer].sort(() => Math.random() - 0.5),
            correct: q.correctAnswer
        };

        timeLeft = 30;
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

io.on('connection', (socket) => {
    socket.on('joinGame', (username) => {
        players[socket.id] = { username: username, score: 0 };
        if (Object.keys(players).length === 1 && !currentQuestion) {
            chargerNouvelleQuestion();
        } else if (currentQuestion) {
            socket.emit('nextQuestion', currentQuestion);
        }
        const sorted = Object.values(players).sort((a, b) => b.score - a.score);
        io.emit('updateLeaderboard', sorted);
    });

    socket.on('submitAnswer', (data) => {
        if (players[socket.id]) {
            if (data.isCorrect) {
                players[socket.id].score += 150;
            } else {
                players[socket.id].score = Math.max(0, players[socket.id].score - 50);
            }
            socket.emit('yourScore', players[socket.id].score);
            const sorted = Object.values(players).sort((a, b) => b.score - a.score);
            io.emit('updateLeaderboard', sorted);
        }
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            delete players[socket.id];
            const sorted = Object.values(players).sort((a, b) => b.score - a.score);
            io.emit('updateLeaderboard', sorted);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur actif sur le port ${PORT}`);
});
