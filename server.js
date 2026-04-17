const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let gameActive = false;
let currentQuestionIndex = 0;
let gameQuestions = [];
let timerValue = 15;
let timerInterval;

const questionBank = [
    { text: "SOURCE DU SIGNAL DETECTÉE : ANNÉE DU PROTOCOLE ?", choices: ["2024", "2025", "2026", "2077"], correct: "2026" },
    { text: "LANGAGE DE SYNTHÈSE DES NEURAL-LINKS ?", choices: ["Python", "C++", "JavaScript", "Assembly"], correct: "javascript" },
    { text: "VITESSE DE TRANSMISSION DE LA GRILLE ?", choices: ["1 Gb/s", "10 Tb/s", "100 Pb/s", "Lumière"], correct: "100 pb/s" },
    { text: "QUEL PROTOCOLE GÈRE LE FLUX NEON ?", choices: ["TCP/IP", "UDP", "NEURAL-7", "SSL"], correct: "neural-7" },
    { text: "COULEUR DOMINANTE DU SECTEUR 01 ?", choices: ["Cyan", "Magenta", "Vert", "Jaune"], correct: "cyan" }
];

function shuffle(array) {
    return array.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    socket.on('joinGame', (username) => {
        const isHost = Object.keys(players).length === 0;
        players[socket.id] = { username, score: 0, streak: 0, isHost };
        socket.emit('hostStatus', isHost);
        io.emit('updateLobby', Object.values(players));
    });

    socket.on('startGameRequest', () => {
        if (players[socket.id]?.isHost && !gameActive) {
            gameActive = true;
            currentQuestionIndex = 0;
            // On pioche 3 questions au hasard pour cette session
            gameQuestions = shuffle([...questionBank]).slice(0, 3); 
            io.emit('gameStart');
            sendQuestion();
        }
    });

    socket.on('submitAnswer', (data) => {
        const p = players[socket.id];
        if (p && data.isCorrect) {
            p.streak++;
            p.score += 100 + (p.streak * 50);
        } else if (p) {
            p.streak = 0;
        }
        socket.emit('yourScore', p?.score || 0);
        socket.emit('feedback', { streak: p?.streak || 0 });
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

function sendQuestion() {
    if (currentQuestionIndex < gameQuestions.length) {
        io.emit('nextQuestion', gameQuestions[currentQuestionIndex]);
        startTimer();
    } else {
        gameActive = false;
        const finalScores = Object.values(players).sort((a,b) => b.score - a.score);
        io.emit('gameOver', finalScores);
    }
}

function startTimer() {
    timerValue = 15;
    clearInterval(timerInterval);
    io.emit('timerUpdate', timerValue);
    timerInterval = setInterval(() => {
        timerValue--;
        io.emit('timerUpdate', timerValue);
        if (timerValue <= 0) {
            clearInterval(timerInterval);
            io.emit('timeUp', gameQuestions[currentQuestionIndex].correct);
            currentQuestionIndex++;
            setTimeout(sendQuestion, 3000);
        }
    }, 1000);
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`SYSTEM ONLINE: ${PORT}`));
