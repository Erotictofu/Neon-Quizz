const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');
const path = require('path');

app.use(express.static(__dirname));

let players = {};
let currentQuestion = null;
let gameStarted = false;
let questionCount = 0;
let timerInterval = null;
let timeLeft = 15;

async function nextQuestion() {
    if (questionCount >= 50) {
        const sorted = Object.values(players).sort((a,b) => b.score - a.score);
        io.emit('gameOver', sorted[0]);
        gameStarted = false;
        return;
    }
    try {
        const res = await axios.get('https://the-trivia-api.com/v2/questions?limit=1');
        const q = res.data[0];
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
        
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timeLeft--;
            io.emit('timerUpdate', timeLeft);
            if(timeLeft <= 0) {
                clearInterval(timerInterval);
                io.emit('timeUp', currentQuestion.correct);
                setTimeout(nextQuestion, 4000);
            }
        }, 1000);
    } catch (e) {
        setTimeout(nextQuestion, 2000);
    }
}

io.on('connection', (socket) => {
    socket.on('joinGame', (name) => {
        const isHost = Object.keys(players).length === 0;
        players[socket.id] = { username: name, score: 0, streak: 0, isHost: isHost };
        socket.emit('hostStatus', isHost);
        io.emit('updateLobby', Object.values(players));
    });

    socket.on('startGameRequest', () => {
        if (!gameStarted) {
            gameStarted = true;
            questionCount = 0;
            io.emit('gameStart');
            nextQuestion();
        }
    });

    socket.on('submitAnswer', (data) => {
        const p = players[socket.id];
        if (!p || !currentQuestion) return;

        if (data.isCorrect) {
            const speed = Math.max(0, 15 - (Date.now() - currentQuestion.startTime)/1000);
            let pts = Math.round(150 + (speed * 10));
            p.streak++;
            if(p.streak >= 3) pts *= 1.5;
            p.score += Math.round(pts);
            socket.emit('feedback', { type: 'correct', streak: p.streak });
        } else {
            p.score = Math.max(0, p.score - 50);
            p.streak = 0;
            socket.emit('feedback', { type: 'wrong', streak: 0 });
        }
        socket.emit('yourScore', p.score);
        io.emit('updateLobby', Object.values(players));
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            const wasHost = players[socket.id].isHost;
            delete players[socket.id];
            if (wasHost && Object.keys(players).length > 0) {
                const nextId = Object.keys(players)[0];
                players[nextId].isHost = true;
                io.to(nextId).emit('hostStatus', true);
            }
        }
        io.emit('updateLobby', Object.values(players));
    });
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, '0.0.0.0', () => console.log(`Serveur prêt`));
