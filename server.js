<script>
    const socket = io();
    let currentCorrect = "";
    
    const playlist = [
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3"
    ];
    let trackIndex = 0;
    const player = document.getElementById('audio-player');

    function playNext() {
        player.src = playlist[trackIndex];
        player.volume = 0.15;
        player.play().catch(e => console.log("Audio en attente..."));
        trackIndex = (trackIndex + 1) % playlist.length;
    }
    player.onended = playNext;

    function join() {
        const n = document.getElementById('nick').value || "RECRUIT_" + Math.floor(Math.random()*99);
        socket.emit('joinGame', n);
        playNext();
        document.getElementById('screen-join').classList.add('hidden');
        document.getElementById('screen-lobby').classList.remove('hidden');
    }

    function start() { socket.emit('startGameRequest'); }

    socket.on('hostStatus', (isHost) => {
        const btn = document.getElementById('start-btn');
        if(isHost) btn.classList.remove('hidden');
        document.getElementById('host-msg').innerText = isHost ? ">> PRIMARY OPERATOR" : ">> AWAITING AUTHORIZATION...";
    });

    socket.on('updateLobby', (players) => {
        document.getElementById('player-list').innerHTML = players.map(p => `<div>> ${p.username}: ${p.score} XP</div>`).join('');
    });

    socket.on('gameStart', () => {
        document.getElementById('screen-lobby').classList.add('hidden');
        document.getElementById('screen-game').classList.remove('hidden');
    });

    socket.on('nextQuestion', (q) => {
        currentCorrect = q.correct; // On stocke la bonne réponse brute
        document.getElementById('q-text').innerText = q.text;
        const container = document.getElementById('choices');
        container.innerHTML = "";
        
        q.choices.forEach(c => {
            const b = document.createElement('button');
            b.innerText = c;
            b.onclick = () => {
                // Comparaison ultra-sécurisée (sans espaces et sans casse)
                const isOk = b.innerText.trim().toLowerCase() === currentCorrect.trim().toLowerCase();
                socket.emit('submitAnswer', { isCorrect: isOk });
                highlight(b);
            };
            container.appendChild(b);
        });
    });

    // CETTE FOIS, C'EST LA BONNE
    function highlight(clickedBtn) {
        const allBtns = document.querySelectorAll('#choices button');
        
        allBtns.forEach(b => {
            b.disabled = true; // On bloque tout
            
            // On compare chaque bouton à la réponse correcte
            const isThisTheRightOne = b.innerText.trim().toLowerCase() === currentCorrect.trim().toLowerCase();
            
            if (isThisTheRightOne) {
                b.classList.add('correct'); // ON FORCE LE VERT
                console.log("Vert appliqué sur : " + b.innerText);
            } else if (b === clickedBtn) {
                b.classList.add('wrong'); // ON FORCE LE ROSE SI CLIQUE ET FAUX
            }
        });
    }

    socket.on('timerUpdate', (t) => {
        document.getElementById('timer-bar').style.width = (t/15)*100 + "%";
    });

    socket.on('timeUp', (ans) => {
        if(ans) currentCorrect = ans; 
        highlight(null); // Révélation automatique si temps écoulé
    });
    
    socket.on('yourScore', (s) => {
        document.getElementById('xp-val').innerText = s.toString().padStart(4, '0');
    });
    
    socket.on('feedback', (f) => {
        const msg = document.getElementById('streak-msg');
        msg.innerText = f.streak >= 3 ? "🔥 STREAK X" + f.streak : "";
    });

    document.getElementById('chat-in').onkeypress = (e) => {
        if(e.key === 'Enter' && e.target.value.trim()) {
            socket.emit('chatMessage', e.target.value);
            e.target.value = "";
        }
    };
    socket.on('chat', (m) => {
        const box = document.getElementById('chat-box');
        box.innerHTML += `<div><span style="color:var(--neon)">[${m.user}]:</span> ${m.text}</div>`;
        box.scrollTop = box.scrollHeight;
    });
</script>
