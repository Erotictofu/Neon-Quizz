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

async function nextQuestion() {
    if (timerInterval) clearInterval(timerInterval);
    if (questionCount >= 50) {
        io.emit('gameOver');
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
    } catch (e) { setTimeout(nextQuestion, 2000); }
}

io.on('connection', (socket) => {
    socket.on('joinGame', (name) => {
        // Le premier connecté est hôte, mais on va autoriser tout le monde pour le test
        const isHost = Object.keys(players).length === 0;
        players[socket.id] = { username: name, score: 0, streak: 0, isHost: isHost };
        socket.emit('hostStatus', true); // FORCE L'AFFICHAGE DU BOUTON START POUR TOUS
        io.emit('updateLobby', Object.values(players).sort((a,b) => b.score - a.score));
    });

    socket.on('startGameRequest', () => {
        console.log("Démarrage forcé par : " + socket.id);
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
            const timeTaken = (Date.now() - currentQuestion.startTime) / 1000;
            const speedBonus = Math.max(0, Math.round((15 - timeTaken) * 10));
            p.streak++;
            let pts = 100 + speedBonus;
            if (p.streak >= 3) pts = Math.round(pts * 1.5);
            p.score += pts;
            socket.emit('feedback', { correct: true, points: pts, streak: p.streak });
        } else {
            p.score = Math.max(0, p.score - 50);
            p.streak = 0;
            socket.emit('feedback', { correct: false, points: -50, streak: 0 });
        }
        io.emit('updateLobby', Object.values(players).sort((a,b) => b.score - a.score));
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updateLobby', Object.values(players).sort((a,b) => b.score - a.score));
    });
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, '0.0.0.0', () => console.log("Server Live on " + PORT));
