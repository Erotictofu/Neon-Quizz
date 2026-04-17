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
        io.emit('gameOver', Object.values(players).sort((a,b) => b.score - a.score)[0]);
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
            startTime: Date.now() // Top chrono pour la vitesse
        };
        io.emit('nextQuestion', currentQuestion);
        
        let timeLeft = 15;
        timerInterval = setInterval(() => {
            timeLeft--;
            io.emit('timerUpdate', timeLeft);
            if(timeLeft <= 0) {
                clearInterval(timerInterval);
                io.emit('timeUp', currentQuestion.correct);
                setTimeout(nextQuestion, 3000);
            }
        }, 1000);
    } catch (e) {
        setTimeout(nextQuestion, 2000);
    }
}

io.on('connection', (socket) => {
    socket.on('joinGame', (name) => {
        const isHost = Object.keys(players).length === 0;
        // On initialise le score et la streak
        players[socket.id] = { username: name, score: 0, streak: 0, isHost: isHost };
        socket.emit('hostStatus', isHost);
        io.emit('updateLobby', Object.values(players).sort((a,b) => b.score - a.score));
    });

    socket.on('startGameRequest', () => {
        if (!gameStarted) {
            gameStarted = true;
            nextQuestion();
        }
    });

    socket.on('submitAnswer', (data) => {
        const p = players[socket.id];
        if (!p || !currentQuestion) return;

        if (data.isCorrect) {
            // CALCUL DES POINTS : Base 100 + Bonus Vitesse (max 150)
            const timeTaken = (Date.now() - currentQuestion.startTime) / 1000;
            const speedBonus = Math.max(0, Math.round((15 - timeTaken) * 10));
            let pointsGagnes = 100 + speedBonus;

            // BONUS DE SÉRIE (Streak)
            p.streak++;
            if (p.streak >= 3) pointsGagnes = Math.round(pointsGagnes * 1.5); // +50% dès 3 bonnes rép.
            if (p.streak >= 5) pointsGagnes = pointsGagnes * 2; // x2 dès 5 bonnes rép.

            p.score += pointsGagnes;
            socket.emit('feedback', { correct: true, points: pointsGagnes, streak: p.streak });
        } else {
            p.score = Math.max(0, p.score - 50); // Malus
            p.streak = 0; // On brise la série
            socket.emit('feedback', { correct: false, points: -50, streak: 0 });
        }
        
        // Mise à jour du classement pour tout le monde
        io.emit('updateLobby', Object.values(players).sort((a,b) => b.score - a.score));
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updateLobby', Object.values(players).sort((a,b) => b.score - a.score));
    });
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, '0.0.0.0');
