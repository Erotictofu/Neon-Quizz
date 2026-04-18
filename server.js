const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');

app.use(express.static(__dirname));

let players = {};
let currentQuestion = null;
let gameStarted = false;
let questionCount = 0;
let timerInterval = null;

function resetServerState() {
    if (timerInterval) clearInterval(timerInterval);
    gameStarted = false;
    questionCount = 0;
    currentQuestion = null;
    io.emit('gameRestarted');
    console.log("Système réinitialisé.");
}

async function nextQuestion() {
    if (timerInterval) clearInterval(timerInterval);
    if (Object.keys(players).length === 0) return resetServerState();

    if (questionCount >= 50) {
        io.emit('gameOver');
        setTimeout(resetServerState, 5000);
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
            startTime: Date.now()
        };
        io.emit('nextQuestion', currentQuestion);
        
        let timeLeft = 15;
        timerInterval = setInterval(() => {
            timeLeft--;
            io.emit('timerUpdate', timeLeft);
            if(timeLeft <= 0) {
                clearInterval(timerInterval);
                io.emit('timeUp', currentQuestion.correct);
                setTimeout(nextQuestion, 3500);
            }
        }, 1000);
    } catch (e) { 
        console.error("Erreur API, reboot...");
        resetServerState(); 
    }
}

io.on('connection', (socket) => {
    socket.on('joinGame', (name) => {
        players[socket.id] = { username: name, score: 0, streak: 0 };
        socket.emit('hostStatus', true); 
        io.emit('updateLobby', Object.values(players).sort((a,b) => b.score - a.score));
        console.log(`${name} a rejoint la session.`);
    });

    socket.on('startGameRequest', () => {
        if (!gameStarted && Object.keys(players).length > 0) {
            gameStarted = true;
            io.emit('gameStart');
            nextQuestion();
        }
    });

    socket.on('submitAnswer', (data) => {
        const p = players[socket.id];
        if (!p || !currentQuestion) return;

        if (data.isCorrect) {
            const timeTaken = (Date.now() - currentQuestion.startTime) / 1000;
            const speedBonus = Math.max(0, Math.round((15 - timeTaken) * 10));
            p.streak++;
            
            let pts = 100 + speedBonus;
            if (p.streak >= 3) pts = Math.round(pts * 1.5);
            if (p.streak >= 5) pts = pts * 2;

            p.score += pts;
            socket.emit('feedback', { correct: true, points: pts, streak: p.streak });
        } else {
            p.streak = 0; 
            socket.emit('feedback', { correct: false, points: 0, streak: 0 });
        }
        io.emit('updateLobby', Object.values(players).sort((a,b) => b.score - a.score));
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        if (Object.keys(players).length === 0) {
            resetServerState();
        } else {
            io.emit('updateLobby', Object.values(players).sort((a,b) => b.score - a.score));
        }
    });
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> PROTOCOLE NEON CONNECTÉ SUR PORT ${PORT}`);
});
