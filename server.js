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
        io.emit('gameOver', Object.values(players).sort((a,b) => b.score - a.score)[0]);
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
                setTimeout(nextQuestion, 3000);
            }
        }, 1000);
    } catch (e) { setTimeout(nextQuestion, 1000); }
}

io.on('connection', (socket) => {
    socket.on('joinGame', (name) => {
        const isHost = Object.keys(players).length === 0;
        players[socket.id] = { username: name, score: 0, streak: 0, isHost: isHost };
        socket.emit('hostStatus', isHost);
        io.emit('updateLobby', Object.values(players));
    });

    socket.on('startGameRequest', () => {
        if(players[socket.id]?.isHost && !gameStarted) {
            gameStarted = true;
            io.emit('gameStart');
            nextQuestion();
        }
    });

    socket.on('submitAnswer', (data) => {
        const p = players[socket.id];
        if (!p || !currentQuestion) return;
        if (data.isCorrect) {
            const speedBonus = Math.max(0, 15 - (Date.now() - currentQuestion.startTime)/1000);
            let points = Math.round(150 + (speedBonus * 6));
            p.streak++;
            if(p.streak >= 3) points = Math.round(points * 1.5);
            p.score += points;
            socket.emit('feedback', { type: 'correct', streak: p.streak });
        } else {
            p.score = Math.max(0, p.score - 50);
            p.streak = 0;
            socket.emit('feedback', { type: 'wrong', streak: 0 });
        }
        socket.emit('yourScore', p.score);
        io.emit('updateLobby', Object.values(players));
    });

    socket.on('chatMessage', (msg) => {
        if(players[socket.id]) io.emit('chat', { user: players[socket.id].username, text: msg });
    });

    socket.on('disconnect', () => {
        if (players[socket.id]?.isHost) {
            delete players[socket.id];
            const next = Object.keys(players)[0];
            if(next) {
                players[next].isHost = true;
                io.to(next).emit('hostStatus', true);
            }
        } else { delete players[socket.id]; }
        io.emit('updateLobby', Object.values(players));
    });
});

http.listen(process.env.PORT || 10000, '0.0.0.0');
