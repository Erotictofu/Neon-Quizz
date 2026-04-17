const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let gameActive = false;
let currentQuestionIndex = 0;
let timerValue = 15;
let timerInterval;

const questions = [
    { text: "SOURCE DU SIGNAL DETECTÉE : ANNÉE DU PROTOCOLE ?", choices: ["2024", "2025", "2026", "2077"], correct: "2026" },
    { text: "LANGAGE DE SYNTHÈSE DES NEURAL-LINKS ?", choices: ["Python", "C++", "JavaScript", "Assembly"], correct: "javascript" },
    { text: "VITESSE DE TRANSMISSION DE LA GRILLE ?", choices: ["1 Gb/s", "10 Tb/s", "100 Pb/s", "Lumière"], correct: "100 pb/s" }
];

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
            sendQuestion();
        }
    });

    socket.on('submitAnswer', (data) => {
        const p = players[socket.id];
        if (p && data.isCorrect) {
            p.streak++;
            p.score += 100 + (p.streak * 25);
        } else if (p) {
            p.streak = 0;
        }
        socket.emit('yourScore', p?.score || 0);
        socket.emit('feedback', { streak: p?.streak || 0 });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updateLobby', Object.values(players));
    });
});

function sendQuestion() {
    if (currentQuestionIndex < questions.length) {
        io.emit('gameStart');
        io.emit('nextQuestion', questions[currentQuestionIndex]);
        startTimer();
    } else {
