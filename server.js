const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');
const path = require('path');

// On sert les fichiers statiques depuis la racine
app.use(express.static(__dirname));

// Route principale : On pointe directement sur index.html sans le dossier /src/
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let players = {};
let currentQuestion = null;

async function chargerNouvelleQuestion() {
    try {
        const response = await axios.get('https://the-trivia-api.com/v2/questions?limit=1');
        const q = response.data[0];
        currentQuestion = {
            text: q.question.text,
            choices: [...q.incorrectAnswers, q.correctAnswer].sort(() => Math.random() - 0.5),
            correct: q.correctAnswer
        };
        io.emit('nextQuestion', currentQuestion);
    } catch (error) {
        console.error("Erreur API :", error.message);
        setTimeout(chargerNouvelleQuestion, 2000);
    }
}

io.on('connection', (socket) => {
    socket.on('joinGame', (username) => {
        players[socket.id] = { username, score: 0 };
        if (Object.keys(players).length === 1 && !currentQuestion) chargerNouvelleQuestion();
        else if (currentQuestion) socket.emit('nextQuestion', currentQuestion);
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log('====================================');
    console.log(`  NEON PULSE ACTIF SUR LE PORT ${PORT} `);
    console.log('====================================');
});
