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
    // Nettoyage systématique du timer précédent
    if (timerInterval) clearInterval(timerInterval);

    if (questionCount >= 50) {
        io.emit('gameOver');
        gameStarted = false;
        questionCount = 0;
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
                // On attend 4 secondes avant la suite pour laisser voir le VERT
                setTimeout(nextQuestion, 4000);
            }
        }, 1000);

    } catch (e) {
        console.log("Erreur API, nouvelle tentative...");
        setTimeout(nextQuestion, 2000);
    }
}

io.on('connection', (socket) => {
    socket.on('joinGame', (name) => {
        const isHost = Object.keys(players).length === 0;
        players[socket.id] = { username: name, score: 0, isHost: isHost };
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
            p.score += 100;
            socket.emit('feedback', true);
        } else {
            p.score = Math.max(0, p.score - 50);
            socket.emit('feedback', false);
        }
        socket.emit('yourScore', p.score);
        io.emit('updateLobby', Object.values(players));
    });

    socket.on('disconnect', () => {
        const wasHost = players[socket.id]?.isHost;
        delete players[socket.id];
        if (wasHost && Object.keys(players).length > 0) {
            const nextId = Object.keys(players)[0];
            players[nextId].isHost = true;
            io.to(nextId).emit('hostStatus', true);
        }
        io.emit('updateLobby', Object.values(players));
    });
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, '0.0.0.0');
