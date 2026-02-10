// ═══════════════════════════════════════════════
        // BACKGROUND ANIMATION
        // ═══════════════════════════════════════════════
        (function initBg() {
            const c = document.getElementById('bg-canvas');
            const ctx = c.getContext('2d');
            let W, H;
            const stars = [];
            function resize() {
                W = c.width = innerWidth;
                H = c.height = innerHeight;
            }
            resize();
            addEventListener('resize', resize);
            for (let i = 0; i < 120; i++) {
                stars.push({
                    x: Math.random() * 2000 - 200, y: Math.random() * 2000 - 200,
                    r: Math.random() * 1.5 + 0.3, speed: Math.random() * 0.3 + 0.05,
                    alpha: Math.random() * 0.6 + 0.2
                });
            }
            function drawBg() {
                ctx.fillStyle = '#0a0e1a';
                ctx.fillRect(0, 0, W, H);
                for (const s of stars) {
                    s.y += s.speed;
                    if (s.y > H + 10) { s.y = -10; s.x = Math.random() * W; }
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(180,200,255,${s.alpha})`;
                    ctx.fill();
                }
                requestAnimationFrame(drawBg);
            }
            drawBg();
        })();

        // ═══════════════════════════════════════════════
        // CONSTANTS
        // ═══════════════════════════════════════════════
        const WIN_SCORE = 10;
        const PLAYER_RADIUS = 18;
        const GEM_RADIUS = 10;
        const PLAYER_SPEED = 4;
        const DASH_SPEED = 14;
        const DASH_DURATION = 150; // ms
        const DASH_COOLDOWN = 1500; // ms
        const MAX_GEMS = 6;
        const ARENA_W = 1200;
        const ARENA_H = 800;
        const SYNC_RATE = 50; // ms between state syncs

        const COLORS = {
            host: { body: '#6c8cff', glow: 'rgba(108,140,255,0.5)', trail: 'rgba(108,140,255,0.25)' },
            guest: { body: '#ff6b8a', glow: 'rgba(255,107,138,0.5)', trail: 'rgba(255,107,138,0.25)' }
        };

        // ═══════════════════════════════════════════════
        // STATE
        // ═══════════════════════════════════════════════
        let isHost = false;
        let peer = null;
        let conn = null;
        let myName = 'Player';
        let oppName = 'Opponent';

        let gameRunning = false;
        let lastTime = 0;

        // Player states
        let me = { x: 200, y: 400, vx: 0, vy: 0, score: 0, dashing: false, dashEnd: 0, dashCooldownEnd: 0 };
        let opp = { x: 1000, y: 400, vx: 0, vy: 0, score: 0, dashing: false };

        let gems = []; // { x, y, id }
        let particles = [];
        let screenShake = { x: 0, y: 0, intensity: 0 };

        // Input
        let keys = {};
        let joystickDir = { x: 0, y: 0 };
        let isMobile = false;

        // ═══════════════════════════════════════════════
        // DOM REFS
        // ═══════════════════════════════════════════════
        const $ = id => document.getElementById(id);
        const lobbyEl = $('lobby');
        const gameUi = $('game-ui');
        const canvas = $('game-canvas');
        const ctx = canvas.getContext('2d');
        const hudScoreMe = $('hud-score-me');
        const hudScoreOpp = $('hud-score-opp');
        const hudNameMe = $('hud-name-me');
        const hudNameOpp = $('hud-name-opp');
        const winModal = $('win-modal');
        const winTitle = $('win-title');
        const winSub = $('win-subtitle');
        const disconnectBanner = $('disconnect-banner');

        // ═══════════════════════════════════════════════
        // UTILS
        // ═══════════════════════════════════════════════
        function genRoomCode() {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let code = '';
            for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
            return code;
        }

        function dist(a, b) {
            return Math.hypot(a.x - b.x, a.y - b.y);
        }

        function spawnGem() {
            return {
                x: 60 + Math.random() * (ARENA_W - 120),
                y: 60 + Math.random() * (ARENA_H - 120),
                id: Math.random().toString(36).slice(2, 8),
                pulse: Math.random() * Math.PI * 2
            };
        }

        function initGems() {
            gems = [];
            for (let i = 0; i < MAX_GEMS; i++) gems.push(spawnGem());
        }

        function addParticles(x, y, color, count = 8) {
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 3 + 1;
                particles.push({
                    x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                    life: 1, decay: 0.02 + Math.random() * 0.02,
                    r: Math.random() * 4 + 2, color
                });
            }
        }

        function shakeScreen(intensity) {
            screenShake.intensity = Math.max(screenShake.intensity, intensity);
        }

        // ═══════════════════════════════════════════════
        // LOBBY LOGIC
        // ═══════════════════════════════════════════════
        $('btn-create').onclick = createRoom;
        $('btn-join-toggle').onclick = () => {
            const js = $('join-section');
            js.style.display = js.style.display === 'none' ? 'block' : 'block';
            $('btn-join-toggle').style.display = 'none';
            $('join-code').focus();
        };
        $('btn-join').onclick = joinRoom;
        $('btn-play-again').onclick = () => location.reload();

        function setStatus(msg) { $('lobby-status').textContent = msg; }

        function createRoom() {
            myName = $('player-name').value.trim() || 'Player 1';
            isHost = true;
            const roomCode = genRoomCode();

            setStatus('Connecting…');
            $('btn-create').disabled = true;

            peer = new Peer('gemrush-' + roomCode, { debug: 0 });

            peer.on('open', () => {
                $('room-code-display').style.display = 'block';
                $('room-code-text').textContent = roomCode;
                $('host-status').textContent = 'Waiting for opponent…';
                setStatus('');
                $('btn-create').style.display = 'none';
                $('or-divider')?.remove();
                $('btn-join-toggle').style.display = 'none';
                $('join-section').style.display = 'none';
            });

            peer.on('connection', (c) => {
                conn = c;
                setupConnection();
            });

            peer.on('error', (err) => {
                if (err.type === 'unavailable-id') {
                    setStatus('Room code taken — try again');
                    $('btn-create').disabled = false;
                } else {
                    setStatus('Error: ' + err.message);
                    $('btn-create').disabled = false;
                }
            });
        }

        function joinRoom() {
            myName = $('player-name').value.trim() || 'Player 2';
            const code = $('join-code').value.trim().toUpperCase();
            if (!code) { setStatus('Enter a room code'); return; }

            isHost = false;
            setStatus('Connecting…');
            $('btn-join').disabled = true;

            peer = new Peer(undefined, { debug: 0 });

            peer.on('open', () => {
                conn = peer.connect('gemrush-' + code, { reliable: true });
                setupConnection();
            });

            peer.on('error', (err) => {
                setStatus('Could not connect: ' + err.message);
                $('btn-join').disabled = false;
            });
        }

        function setupConnection() {
            conn.on('open', () => {
                // Exchange names
                conn.send({ type: 'hello', name: myName });

                conn.on('data', onData);

                conn.on('close', () => {
                    disconnectBanner.style.display = 'block';
                });

                // If host, wait for hello then start
                if (!isHost) {
                    setStatus('Connected! Waiting for game to start…');
                }
            });

            conn.on('error', (err) => {
                setStatus('Connection error: ' + err.message);
            });
        }

        // ═══════════════════════════════════════════════
        // NETWORK MESSAGES
        // ═══════════════════════════════════════════════
        function onData(data) {
            switch (data.type) {
                case 'hello':
                    oppName = data.name || 'Opponent';
                    if (isHost) {
                        // Host starts the game
                        initGems();
                        me = { x: 200, y: ARENA_H / 2, vx: 0, vy: 0, score: 0, dashing: false, dashEnd: 0, dashCooldownEnd: 0 };
                        opp = { x: ARENA_W - 200, y: ARENA_H / 2, vx: 0, vy: 0, score: 0, dashing: false, dashEnd: 0, dashCooldownEnd: 0 };
                        conn.send({ type: 'start', gems: gems, hostName: myName, guestName: oppName });
                        startGame();
                    }
                    break;

                case 'start':
                    gems = data.gems;
                    oppName = data.hostName;
                    myName = $('player-name').value.trim() || 'Player 2';
                    me = { x: ARENA_W - 200, y: ARENA_H / 2, vx: 0, vy: 0, score: 0, dashing: false, dashEnd: 0, dashCooldownEnd: 0 };
                    opp = { x: 200, y: ARENA_H / 2, vx: 0, vy: 0, score: 0, dashing: false, dashEnd: 0, dashCooldownEnd: 0 };
                    startGame();
                    break;

                case 'state':
                    // Received opponent's position/state
                    opp.x = data.x;
                    opp.y = data.y;
                    opp.vx = data.vx;
                    opp.vy = data.vy;
                    opp.score = data.score;
                    opp.dashing = data.dashing;
                    break;

                case 'gem-collect':
                    // Opponent collected a gem
                    gems = gems.filter(g => g.id !== data.gemId);
                    addParticles(data.x, data.y, '#ffd666', 12);
                    opp.score = data.score;
                    // Host spawns replacement
                    if (isHost && gems.length < MAX_GEMS) {
                        const ng = spawnGem();
                        gems.push(ng);
                        conn.send({ type: 'gem-spawn', gem: ng });
                    }
                    break;

                case 'gem-spawn':
                    gems.push(data.gem);
                    break;

                case 'dash-hit':
                    // I got hit by opponent's dash — lose 1 gem
                    me.score = Math.max(0, me.score - 1);
                    opp.score = data.oppScore;
                    shakeScreen(8);
                    addParticles(me.x, me.y, '#ff4060', 15);
                    break;

                case 'win':
                    endGame(false);
                    break;
            }
        }

        function sendState() {
            if (!conn || !conn.open) return;
            conn.send({
                type: 'state',
                x: me.x, y: me.y,
                vx: me.vx, vy: me.vy,
                score: me.score,
                dashing: me.dashing
            });
        }

        // ═══════════════════════════════════════════════
        // GAME INIT & LOOP
        // ═══════════════════════════════════════════════
        function startGame() {
            lobbyEl.style.display = 'none';
            gameUi.style.display = 'block';
            hudNameMe.textContent = myName;
            hudNameOpp.textContent = oppName;

            const myColor = isHost ? COLORS.host : COLORS.guest;
            const oppColor = isHost ? COLORS.guest : COLORS.host;
            $('hud-dot-me').style.background = myColor.body;
            $('hud-dot-me').style.boxShadow = `0 0 8px ${myColor.body}`;
            $('hud-dot-opp').style.background = oppColor.body;
            $('hud-dot-opp').style.boxShadow = `0 0 8px ${oppColor.body}`;

            resizeCanvas();
            gameRunning = true;
            lastTime = performance.now();
            detectMobile();
            gameLoop();
            setInterval(sendState, SYNC_RATE);
        }

        function resizeCanvas() {
            canvas.width = innerWidth;
            canvas.height = innerHeight;
        }
        addEventListener('resize', resizeCanvas);

        function gameLoop() {
            if (!gameRunning) return;
            const now = performance.now();
            const dt = Math.min((now - lastTime) / 16.667, 3); // normalize to 60fps
            lastTime = now;

            update(dt, now);
            render();
            requestAnimationFrame(gameLoop);
        }

        // ═══════════════════════════════════════════════
        // UPDATE
        // ═══════════════════════════════════════════════
        function update(dt, now) {
            // ── Input ──
            let ix = 0, iy = 0;
            if (keys['ArrowLeft'] || keys['KeyA']) ix -= 1;
            if (keys['ArrowRight'] || keys['KeyD']) ix += 1;
            if (keys['ArrowUp'] || keys['KeyW']) iy -= 1;
            if (keys['ArrowDown'] || keys['KeyS']) iy += 1;

            // Mobile joystick
            if (isMobile && (joystickDir.x || joystickDir.y)) {
                ix = joystickDir.x;
                iy = joystickDir.y;
            }

            // Normalize diagonal
            const mag = Math.hypot(ix, iy);
            if (mag > 0) { ix /= mag; iy /= mag; }

            // Dash
            if (me.dashing && now > me.dashEnd) {
                me.dashing = false;
            }

            const speed = me.dashing ? DASH_SPEED : PLAYER_SPEED;
            me.vx = ix * speed;
            me.vy = iy * speed;
            me.x += me.vx * dt;
            me.y += me.vy * dt;

            // Clamp to arena
            me.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_W - PLAYER_RADIUS, me.x));
            me.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_H - PLAYER_RADIUS, me.y));

            // Trail particles when moving
            if (mag > 0 && Math.random() < 0.3) {
                const col = isHost ? COLORS.host.trail : COLORS.guest.trail;
                particles.push({
                    x: me.x + (Math.random() - 0.5) * 10,
                    y: me.y + (Math.random() - 0.5) * 10,
                    vx: -me.vx * 0.1, vy: -me.vy * 0.1,
                    life: 0.6, decay: 0.02, r: Math.random() * 4 + 2, color: col
                });
            }

            // ── Gem collection ──
            for (let i = gems.length - 1; i >= 0; i--) {
                const g = gems[i];
                if (dist(me, g) < PLAYER_RADIUS + GEM_RADIUS) {
                    me.score++;
                    addParticles(g.x, g.y, '#ffd666', 12);
                    conn.send({ type: 'gem-collect', gemId: g.id, x: g.x, y: g.y, score: me.score });
                    gems.splice(i, 1);

                    // Host spawns replacement
                    if (isHost && gems.length < MAX_GEMS) {
                        const ng = spawnGem();
                        gems.push(ng);
                        conn.send({ type: 'gem-spawn', gem: ng });
                    }

                    // Check win
                    if (me.score >= WIN_SCORE) {
                        conn.send({ type: 'win' });
                        endGame(true);
                        return;
                    }
                }
            }

            // ── Dash hit detection ──
            if (me.dashing && dist(me, opp) < PLAYER_RADIUS * 2.2) {
                // Steal a gem from opponent
                opp.score = Math.max(0, opp.score - 1);
                me.score++;
                shakeScreen(10);
                addParticles((me.x + opp.x) / 2, (me.y + opp.y) / 2, '#ff4060', 18);
                conn.send({ type: 'dash-hit', oppScore: me.score });
                me.dashing = false;

                if (me.score >= WIN_SCORE) {
                    conn.send({ type: 'win' });
                    endGame(true);
                    return;
                }
            }

            // ── Particles ──
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.life -= p.decay * dt;
                if (p.life <= 0) particles.splice(i, 1);
            }

            // ── Screen shake decay ──
            if (screenShake.intensity > 0) {
                screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
                screenShake.y = (Math.random() - 0.5) * screenShake.intensity;
                screenShake.intensity *= 0.88;
                if (screenShake.intensity < 0.3) screenShake.intensity = 0;
            }

            // ── HUD ──
            hudScoreMe.textContent = me.score;
            hudScoreOpp.textContent = opp.score;
        }

        // ═══════════════════════════════════════════════
        // RENDER
        // ═══════════════════════════════════════════════
        function render() {
            const W = canvas.width;
            const H = canvas.height;
            ctx.clearRect(0, 0, W, H);

            // Camera: center arena on screen
            const scaleX = W / ARENA_W;
            const scaleY = H / ARENA_H;
            const scale = Math.min(scaleX, scaleY) * 0.92;
            const offsetX = (W - ARENA_W * scale) / 2 + screenShake.x;
            const offsetY = (H - ARENA_H * scale) / 2 + screenShake.y;

            ctx.save();
            ctx.translate(offsetX, offsetY);
            ctx.scale(scale, scale);

            // ── Arena background ──
            ctx.fillStyle = '#0d1225';
            ctx.beginPath();
            ctx.roundRect(0, 0, ARENA_W, ARENA_H, 20);
            ctx.fill();

            // Grid lines
            ctx.strokeStyle = 'rgba(100,140,255,0.05)';
            ctx.lineWidth = 1;
            for (let x = 0; x <= ARENA_W; x += 60) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_H); ctx.stroke();
            }
            for (let y = 0; y <= ARENA_H; y += 60) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA_W, y); ctx.stroke();
            }

            // Arena border
            ctx.strokeStyle = 'rgba(100,140,255,0.15)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(0, 0, ARENA_W, ARENA_H, 20);
            ctx.stroke();

            // Center line
            ctx.strokeStyle = 'rgba(100,140,255,0.08)';
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 10]);
            ctx.beginPath(); ctx.moveTo(ARENA_W / 2, 0); ctx.lineTo(ARENA_W / 2, ARENA_H); ctx.stroke();
            ctx.setLineDash([]);

            // ── Particles ──
            for (const p of particles) {
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            // ── Gems ──
            const t = performance.now() / 1000;
            for (const g of gems) {
                const pulse = 1 + Math.sin(t * 3 + (g.pulse || 0)) * 0.15;
                const r = GEM_RADIUS * pulse;

                // Glow
                ctx.shadowColor = '#ffd666';
                ctx.shadowBlur = 18;

                // Diamond shape
                ctx.fillStyle = '#ffd666';
                ctx.beginPath();
                ctx.moveTo(g.x, g.y - r * 1.3);
                ctx.lineTo(g.x + r, g.y);
                ctx.lineTo(g.x, g.y + r * 1.3);
                ctx.lineTo(g.x - r, g.y);
                ctx.closePath();
                ctx.fill();

                // Inner highlight
                ctx.fillStyle = 'rgba(255,255,220,0.5)';
                ctx.beginPath();
                ctx.moveTo(g.x, g.y - r * 0.7);
                ctx.lineTo(g.x + r * 0.5, g.y);
                ctx.lineTo(g.x, g.y + r * 0.3);
                ctx.lineTo(g.x - r * 0.5, g.y);
                ctx.closePath();
                ctx.fill();

                ctx.shadowBlur = 0;
            }

            // ── Draw players ──
            drawPlayer(me, isHost ? COLORS.host : COLORS.guest, myName, true);
            drawPlayer(opp, isHost ? COLORS.guest : COLORS.host, oppName, false);

            ctx.restore();
        }

        function drawPlayer(p, colors, name, isMe) {
            // Dash ring
            if (p.dashing) {
                ctx.strokeStyle = colors.body;
                ctx.lineWidth = 3;
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, PLAYER_RADIUS + 8, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }

            // Glow
            ctx.shadowColor = colors.body;
            ctx.shadowBlur = 22;

            // Body
            ctx.fillStyle = colors.body;
            ctx.beginPath();
            ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
            ctx.fill();

            // Inner highlight
            const grad = ctx.createRadialGradient(p.x - 4, p.y - 6, 2, p.x, p.y, PLAYER_RADIUS);
            grad.addColorStop(0, 'rgba(255,255,255,0.35)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;

            // Name
            ctx.fillStyle = '#fff';
            ctx.font = '600 12px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText(name, p.x, p.y - PLAYER_RADIUS - 8);

            // Score badge
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffd666';
            ctx.font = '700 11px Outfit';
            ctx.fillText(p.score, p.x, p.y + 4);
        }

        // ═══════════════════════════════════════════════
        // END GAME
        // ═══════════════════════════════════════════════
        function endGame(iWon) {
            gameRunning = false;
            winTitle.textContent = iWon ? '🏆 You Win!' : '😢 You Lose!';
            winTitle.style.color = iWon ? '#5cffb1' : '#ff6b8a';
            winSub.textContent = iWon
                ? `You collected ${WIN_SCORE} gems first!`
                : `${oppName} collected ${WIN_SCORE} gems first.`;
            winModal.classList.add('show');
        }

        // ═══════════════════════════════════════════════
        // INPUT — KEYBOARD
        // ═══════════════════════════════════════════════
        addEventListener('keydown', (e) => {
            keys[e.code] = true;
            // Dash on Space or Shift
            if ((e.code === 'Space' || e.code === 'ShiftLeft') && gameRunning) {
                triggerDash();
            }
        });
        addEventListener('keyup', (e) => { keys[e.code] = false; });

        function triggerDash() {
            const now = performance.now();
            if (me.dashing || now < me.dashCooldownEnd) return;
            if (me.vx === 0 && me.vy === 0) return; // Must be moving
            me.dashing = true;
            me.dashEnd = now + DASH_DURATION;
            me.dashCooldownEnd = now + DASH_COOLDOWN;
            shakeScreen(3);
            const col = isHost ? COLORS.host.body : COLORS.guest.body;
            addParticles(me.x, me.y, col, 10);
        }

        // ═══════════════════════════════════════════════
        // INPUT — MOBILE JOYSTICK
        // ═══════════════════════════════════════════════
        function detectMobile() {
            isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            if (isMobile) {
                $('dash-btn').style.display = 'block';
            }
        }

        (function initJoystick() {
            const zone = $('joystick-zone');
            const base = $('joy-base');
            const stick = $('joy-stick');
            let active = false;
            let originX, originY;
            const MAX_DIST = 50;

            zone.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const t = e.touches[0];
                originX = t.clientX;
                originY = t.clientY;
                base.style.display = 'block';
                stick.style.display = 'block';
                base.style.left = (originX - 60) + 'px';
                base.style.top = (originY - 60) + 'px';
                stick.style.left = (originX - 25) + 'px';
                stick.style.top = (originY - 25) + 'px';
                active = true;
            }, { passive: false });

            zone.addEventListener('touchmove', (e) => {
                if (!active) return;
                e.preventDefault();
                const t = e.touches[0];
                let dx = t.clientX - originX;
                let dy = t.clientY - originY;
                const d = Math.hypot(dx, dy);
                if (d > MAX_DIST) { dx = dx / d * MAX_DIST; dy = dy / d * MAX_DIST; }
                stick.style.left = (originX + dx - 25) + 'px';
                stick.style.top = (originY + dy - 25) + 'px';
                joystickDir.x = dx / MAX_DIST;
                joystickDir.y = dy / MAX_DIST;
            }, { passive: false });

            zone.addEventListener('touchend', () => {
                active = false;
                base.style.display = 'none';
                stick.style.display = 'none';
                joystickDir.x = 0;
                joystickDir.y = 0;
            });

            $('dash-btn').addEventListener('touchstart', (e) => {
                e.preventDefault();
                triggerDash();
            }, { passive: false });
        })();