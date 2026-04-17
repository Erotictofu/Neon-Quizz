const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');

// Permet de servir ton fichier index.html et tes assets (sons/images)
app.use(express.static(__dirname));

let players = {};
let currentQuestion = null;
let timeLeft = 30;
let timerInterval = null;

// Route principale
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// FONCTION : Charger une nouvelle question depuis l'API
async function chargerNouvelleQuestion() {
    try {
        console.log("--- Récupération d'une nouvelle question ---");
        const res = await axios.get('https://the-trivia-api.com/v2/questions?limit=1');
        const q = res.data[0];
        
        currentQuestion = {
            text: q.question.text,
            choices: [...q.incorrectAnswers, q.correctAnswer].sort(() => Math.random() - 0.5),
            correct: q.correctAnswer
        };

        timeLeft = 30;
        // Diffuse la question à tous les joueurs connectés
        io.emit('nextQuestion', currentQuestion);
        
        startTimer();
    } catch (error) {
        console.error("Erreur API Trivia (nouvelle tentative dans 2s) :", error.message);
        setTimeout(chargerNouvelleQuestion, 2000);
    }
}

// FONCTION : Gérer le compte à rebours de 30 secondes
function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        
        // Envoie le temps restant pour mettre à jour la barre de progression
        io.emit('timerUpdate', timeLeft);

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            // Notifie tout le monde que le temps est fini et montre la réponse
            io.emit('timeUp', currentQuestion.correct);
            
            // Attend 4 secondes pour que les joueurs voient la correction avant la suite
            setTimeout(chargerNouvelleQuestion, 4000);
        }
    }, 1000);
}

// GESTION DES CONNEXIONS SOCKET.IO
io.on('connection', (socket) => {
    console.log(`Signal détecté : ${socket.id}`);

    // Quand un joueur rejoint avec son pseudo
    socket.on('joinGame', (username) => {
        players[socket.id] = { 
            username: username, 
            score: 0 
        };
        console.log(`Pilote authentifié : ${username}`);
        
        // Si c'est le premier joueur, on lance la machine
        if (Object.keys(players).length === 1 && !currentQuestion) {
            chargerNouvelleQuestion();
        } else if (currentQuestion) {
            // Si une question est déjà en cours, on lui envoie immédiatement
            socket.emit('nextQuestion', currentQuestion);
        }
        
        envoyerClassement();
    });

    // Quand un joueur envoie une réponse
    socket.on('submitAnswer', (data) => {
        if (players[socket.id]) {
            if (data.isCorrect) {
                players[socket.id].score += 150;
            } else {
                players[socket.id].score = Math.max(0, players[socket.id].score - 50);
            }
            
            // Renvoie le score mis à jour au joueur
            socket.emit('yourScore', players[socket.id].score);
            envoyerClassement();
        }
    });

    // Quand un joueur quitte
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            console.log(`Pilote déconnecté : ${players[socket.id].username}`);
            delete players[socket.id];
            envoyerClassement();
        }
    });

    function envoyerClassement() {
        const sorted = Object.values(players).sort((a, b) => b.score - a.score);
        io.emit('updateLeaderboard', sorted);
    }
});

// MODIFICATION POUR RENDER : Utiliser process.env.PORT
const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log('====================================');
    console.log(`  NEON PULSE ACTIF SUR LE PORT ${PORT} `);
    console.log('====================================');
});