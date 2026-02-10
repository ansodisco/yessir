// ---------------- DATA ----------------
        const DICT = [
            { kz: 'сәлеметсіз бе', en: 'hello' }, { kz: 'рақмет', en: 'thank you' }, { kz: 'иә', en: 'yes' }, { kz: 'жоқ', en: 'no' },
            { kz: 'ана', en: 'mother' }, { kz: 'әке', en: 'father' }, { kz: 'дос', en: 'friend' }, { kz: 'үй', en: 'house' },
            { kz: 'мысық', en: 'cat' }, { kz: 'ит', en: 'dog' }, { kz: 'білім', en: 'knowledge' }, { kz: 'кітап', en: 'book' },
            { kz: 'мектеп', en: 'school' }, { kz: 'алма', en: 'apple' }, { kz: 'нан', en: 'bread' }, { kz: 'су', en: 'water' },
            { kz: 'қызыл', en: 'red' }, { kz: 'жасыл', en: 'green' }, { kz: 'көк', en: 'blue' }, { kz: 'ақ', en: 'white' },
            { kz: 'күн', en: 'sun' }, { kz: 'ай', en: 'moon' }, { kz: 'тау', en: 'mountain' }, { kz: 'өзен', en: 'river' },
            { kz: 'уақыт', en: 'time' }, { kz: 'ақша', en: 'money' }, { kz: 'жұмыс', en: 'work' }, { kz: 'сөз', en: 'word' }
        ];

        // ---------------- UI UTILS ----------------
        const UI = {
            get: id => document.getElementById(id),
            show: id => { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); UI.get(id).classList.add('active'); },
            showLobby: () => UI.show('screen-lobby'),
            showJoin: () => UI.show('screen-join'),
            log: msg => { const d = UI.get('debug-log'); d.innerHTML += `<div>${msg}</div>`; console.log(msg); },
            status: (id, msg, type = 'neutral') => { const el = UI.get(id); el.textContent = msg; el.className = `status ${type}`; },
            toast: (type) => {
                const t = UI.get(type === 'good' ? 'toast-correct' : 'toast-wrong');
                t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 600);
            }
        };

        // ---------------- GAME LOGIC ----------------
        const Game = {
            mode: 'single', // 'single' or 'multi'
            peer: null,
            conn: null,
            myName: 'Player',
            oppName: 'Bot',
            scoreMe: 0,
            scoreOpp: 0,
            timer: 90,
            interval: null,
            botInterval: null,
            currentQ: null,
            isHost: false,

            init: () => {
                UI.get('inp-ans').addEventListener('keydown', e => { if (e.key === 'Enter') Game.checkAnswer(); });
            },

            createRoom: () => {
                Game.myName = UI.get('inp-name').value.trim() || 'Host';
                Game.isHost = true;
                Game.mode = 'multi';
                const code = Math.random().toString(36).substring(2, 7).toUpperCase();

                UI.status('status-lobby', 'Starting server...');

                try {
                    Game.peer = new Peer('kztb-' + code);
                    Game.peer.on('open', id => {
                        UI.show('screen-host');
                        UI.get('host-code').textContent = code;
                        UI.log(`Room created: ${code}`);
                    });
                    Game.peer.on('connection', conn => {
                        Game.conn = conn;
                        Game.setupConn();
                        UI.log('Player connected!');
                    });
                    Game.peer.on('error', err => {
                        if (err.type === 'unavailable-id') {
                            setTimeout(Game.createRoom, 500); // Retry
                        } else {
                            UI.status('status-lobby', 'Error: ' + err.type, 'error');
                        }
                    });
                } catch (e) { UI.status('status-lobby', 'PeerJS missing?', 'error'); }
            },

            joinRoom: () => {
                Game.myName = UI.get('inp-name').value.trim() || 'Guest';
                Game.isHost = false;
                Game.mode = 'multi';
                const code = UI.get('inp-code').value.trim().toUpperCase();

                UI.status('status-join', 'Connecting...');

                try {
                    Game.peer = new Peer();
                    Game.peer.on('open', id => {
                        Game.conn = Game.peer.connect('kztb-' + code);
                        Game.setupConn();
                        setTimeout(() => {
                            if (!Game.conn.open) UI.status('status-join', 'Room not found or busy.', 'error');
                        }, 5000);
                    });
                } catch (e) { UI.status('status-join', 'Connection error', 'error'); }
            },

            setupConn: () => {
                Game.conn.on('open', () => {
                    Game.conn.send({ t: 'hello', name: Game.myName });
                });
                Game.conn.on('data', d => {
                    if (d.t === 'hello') {
                        Game.oppName = d.name;
                        if (Game.isHost) {
                            Game.conn.send({ t: 'start', name: Game.myName });
                            Game.start();
                        }
                    }
                    if (d.t === 'start') {
                        Game.oppName = d.name;
                        Game.start();
                    }
                    if (d.t === 'score') {
                        Game.scoreOpp = d.val;
                        Game.updateHUD();
                        UI.toast('opp'); // maybe different color
                    }
                    if (d.t === 'end') {
                        Game.end();
                    }
                });
            },

            startSinglePlayer: () => {
                Game.mode = 'single';
                Game.myName = UI.get('inp-name').value.trim() || 'Player';
                Game.oppName = 'Bot (Hard)';
                Game.start();
            },

            start: () => {
                UI.show('screen-game');
                Game.scoreMe = 0;
                Game.scoreOpp = 0;
                Game.timer = 60;
                UI.get('label-opp').textContent = Game.oppName;
                Game.updateHUD();
                Game.nextQ();
                UI.get('inp-ans').focus();

                Game.interval = setInterval(() => {
                    Game.timer--;
                    UI.get('timer').textContent = Game.timer;
                    if (Game.timer <= 0) Game.end();
                }, 1000);

                if (Game.mode === 'single') {
                    // Bot logic: randomly score 1 point every 3-7 seconds
                    Game.botInterval = setInterval(() => {
                        if (Math.random() > 0.4) {
                            Game.scoreOpp++;
                            Game.updateHUD();
                        }
                    }, 4000);
                }
            },

            nextQ: () => {
                const item = DICT[Math.floor(Math.random() * DICT.length)];
                const isKz = Math.random() > 0.5;
                Game.currentQ = {
                    q: isKz ? item.kz : item.en,
                    a: isKz ? item.en : item.kz,
                    task: isKz ? 'Kazakh → English' : 'English → Kazakh'
                };

                UI.get('q-ctx').textContent = Game.currentQ.task;
                UI.get('q-text').textContent = Game.currentQ.q;
                UI.get('inp-ans').value = '';
                UI.get('inp-ans').focus();
            },

            checkAnswer: () => {
                const val = UI.get('inp-ans').value.trim().toLowerCase();
                if (!val) return;

                const target = Game.currentQ.a.toLowerCase();

                // Simple check
                if (val === target) {
                    Game.scoreMe++;
                    UI.toast('good');
                    if (Game.mode === 'multi') Game.conn.send({ t: 'score', val: Game.scoreMe });
                    Game.nextQ();
                } else {
                    UI.toast('bad');
                    UI.get('inp-ans').value = ''; // clear on wrong?
                    UI.get('inp-ans').style.borderColor = 'var(--danger)';
                    setTimeout(() => UI.get('inp-ans').style.borderColor = 'var(--border)', 300);
                }
                Game.updateHUD();
            },

            updateHUD: () => {
                UI.get('score-me').textContent = Game.scoreMe;
                UI.get('score-opp').textContent = Game.scoreOpp;
            },

            end: () => {
                clearInterval(Game.interval);
                if (Game.botInterval) clearInterval(Game.botInterval);
                if (Game.mode === 'multi' && Game.conn) Game.conn.send({ t: 'end' });

                UI.show('screen-results');
                UI.get('res-me').textContent = Game.scoreMe;
                UI.get('res-opp').textContent = Game.scoreOpp;

                const won = Game.scoreMe > Game.scoreOpp;
                const tie = Game.scoreMe === Game.scoreOpp;
                const msg = tie ? 'It\'s a Draw!' : (won ? 'You Won!' : 'You Lost!');
                UI.get('res-msg').textContent = msg;
                UI.get('res-msg').style.color = tie ? 'var(--accent)' : (won ? 'var(--success)' : 'var(--danger)');
            }
        };

        Game.init();
