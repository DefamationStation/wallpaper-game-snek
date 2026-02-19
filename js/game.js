'use strict';

// ============================================================
// GAME LOGIC
// ============================================================

// Emoji pools for thought bubbles (fired as one-shot events on state transitions).
const THOUGHT_EAT = ['😋', '✨', '🍎', '💚'];
const THOUGHT_FULL = ['😌', '💤', '🌿', '😴'];
const THOUGHT_HUNGRY = ['😋', '👀', '🍎', '⚡'];
const THOUGHT_TIGHT = ['😰', '😬'];
const THOUGHT_DEATH = ['💥', '💀', '😵'];
const THOUGHT_SAD = ['😢', '😭'];
const THOUGHT_GROSS = ['🤢', '🤮'];
const THOUGHT_GREET = ['👋', '🫂'];
const THOUGHT_CHAT = ['💬', '🗨️', '🗣️'];
const SNEK_NAME_POOL = [
    'Snekboi', 'Snekgirl', 'Noodlebro', 'Noodlette', 'Sir Hiss', 'Lady Loop',
    'Wiggles', 'Boop Snek', 'Cuddles', 'Slinky', 'Hissy Elliott', 'Snakira',
    'Snek Diesel', 'Mamba Mia', 'Noodle Queen', 'Noodle King', 'Coily Ray',
    'Slither Swift', 'Lil Hiss', 'Biscuit Snek', 'Princess Scales', 'Duke Danger',
    'Miss Wiggle', 'Captain Noodle', 'Hiss Hemsworth', 'Queen Boop',
    'Snekoncé', 'Cha Cha Coil', 'Boba Snek', 'Sushi Snek', 'Ziggy', 'Mochi',
    'Pickles', 'Pumpkin', 'Nova', 'Echo', 'Milo', 'Luna', 'Ruby', 'Jasper'
];

// Cooldown per snake pair (keyed by sorted id pair) to avoid spamming greetings.
const _greetCooldowns = {};
const _greetPairState = {};

function pickRandomSnekName(excludeSet) {
    const available = SNEK_NAME_POOL.filter(n => !excludeSet.has(n));
    const pool = available.length ? available : SNEK_NAME_POOL;
    return pool[Math.floor(Math.random() * pool.length)];
}

// Spawn a chat-bubble thought above the snake's head.
// The thought follows the snake's head for its lifetime.
// pool: array of emojis to pick from.
// lifetime: ms the bubble stays (default 2000). Use longer values for persistent mood states.
function spawnThought(sn, pool, lifetime) {
    if (!sn.body.length) return;
    sn.thoughts.push({
        emoji: pool[Math.floor(Math.random() * pool.length)],
        born: performance.now(),
        lifetime: lifetime || 2000,
    });
}

// Factory for a fresh snake object. id: integer identifier (0 = primary).
// colorHead: optional hex string; falls back to SNAKE_COLORS[theme][id] or palette default.
function makeSnake(id, body, colorHead, displayName) {
    const theme = state.theme || 'day';
    const defaultColor = (SNAKE_COLORS[theme] && SNAKE_COLORS[theme][id])
        || PALETTES[theme].snakeHead;
    const head = colorHead || defaultColor;
    return {
        id,
        displayName,
        body,
        prevBody: body.map(c => ({ x: c.x, y: c.y })),
        food: null,
        nextDir: { x: 1, y: 0 },
        // per-snake colors (food is always derived from colorHead)
        colorHead: head,
        colorBody: lightenHex(head, 0.28),
        userCustomized: false,  // true once the user manually picks a color for this snake
        // satiety
        satiety: 0,
        wandering: false,
        wanderStartMs: 0,
        lastTrimMs: 0,
        trimCount: 0,
        // mood thought bubbles
        thoughts: [],
        // random roam target used during wander mode
        wanderTarget: null,
        // internal flag so AI can signal desperation this tick
        _desperationThisTick: false,
        // per-snake tick timer (used by loop.js)
        lastTickMs: 0,
        lastMoveMs: 0,
        lastGrossThoughtMs: 0,
        // respawn state
        respawning: false,
        respawnAt: 0,
    };
}

// ---- Per-snake game tick ----
// Called by loop.js once per tick for each living (non-respawning) snake.
function gameTickForSnake(sn) {
    if (state.status !== 'running') return;

    const now = performance.now();

    // ---- Wander mode management ----
    if (sn.wandering) {
        const elapsed = now - sn.wanderStartMs;

        // Lose 1 tail segment every WANDER_TRIM_INTERVAL_MS, up to WANDER_MAX_TRIMS.
        if (sn.trimCount < WANDER_MAX_TRIMS &&
            now - sn.lastTrimMs >= WANDER_TRIM_INTERVAL_MS &&
            sn.body.length > 1) {
            sn.body.pop();
            sn.trimCount++;
            sn.lastTrimMs = now;
        }

        // Exit wander mode after WANDER_DURATION_MS.
        if (elapsed >= WANDER_DURATION_MS) {
            sn.wandering = false;
            sn.wanderTarget = null;
            spawnThought(sn, THOUGHT_HUNGRY, 3000);
        }
    }

    // If a wall has faded in (or is fading in) over the food cell, relocate it.
    if (sn.food && state.conway.enabled && state.conway.wallAlpha) {
        const fi = sn.food.y * state.cols + sn.food.x;
        const blocked = state.conway.wallAlpha[fi] >= 0.5 ||
            (state.conway.wallTarget && state.conway.wallTarget[fi]);
        if (blocked) placeFood(sn);
    }

    sn._desperationThisTick = false;
    sn.nextDir = computeNextDirection(sn);

    // Show tight-space thought if desperation AI fired this tick.
    if (sn._desperationThisTick) spawnThought(sn, THOUGHT_TIGHT);

    const head = sn.body[0];
    const newHead = { x: head.x + sn.nextDir.x, y: head.y + sn.nextDir.y };

    if (!inBounds(newHead.x, newHead.y)) { handleSnakeDeath(sn); return; }

    // Collision check: other snakes' bodies (and own body minus tail) are walls.
    const occupied = buildOccupiedGrid(false, false, sn);
    const tail = sn.body[sn.body.length - 1];
    occupied[tail.y * state.cols + tail.x] = 0;   // tail vacates this tick
    if (occupied[newHead.y * state.cols + newHead.x]) { handleSnakeDeath(sn); return; }

    const ateFood = sn.food &&
        newHead.x === sn.food.x &&
        newHead.y === sn.food.y;

    const prevBody = sn.body.map(c => ({ x: c.x, y: c.y }));
    sn.body.unshift(newHead);
    if (!ateFood) sn.body.pop();
    sn.prevBody = prevBody;
    sn.lastMoveMs = now;

    if (ateFood) {
        spawnThought(sn, THOUGHT_EAT);

        if (sn.body.length >= state.cols * state.rows) {
            triggerComplete();
            return;
        } else {
            placeFood(sn);
        }

        // Increment satiety; enter wander mode at SATIETY_MAX.
        if (!sn.wandering) {
            sn.satiety++;
            if (sn.satiety >= SATIETY_MAX) {
                sn.satiety = 0;
                sn.wandering = true;
                sn.wanderStartMs = performance.now();
                sn.lastTrimMs = performance.now();
                sn.trimCount = 0;
                spawnThought(sn, THOUGHT_FULL, 4000);
            }
        }
    }

    // ---- Proximity greeting ----
    // When this snake's head is within GREET_DISTANCE cells of another snake's head,
    // both snakes show a greeting thought (with a cooldown to avoid spam).
    checkGreetings(sn);
    checkGrossFoodNearby(sn, now);
}

const GREET_DISTANCE = 6; // Manhattan distance threshold
const GREET_RESET_DISTANCE = 10; // must separate by this distance before greeting again
const GREET_COOLDOWN_MS = 8000; // minimum ms between greetings for a given pair
const GREET_CHAT_AFTER_MS = 4000; // continuous proximity time before chat bubble appears
const GROSS_FOOD_DISTANCE = 1; // Manhattan distance from another snake's food
const GROSS_FOOD_COOLDOWN_MS = 4000; // avoid spamming gross thoughts

function checkGreetings(sn) {
    if (state.snakes.length < 2) return;
    if (sn.respawning || !sn.body.length) return;
    const head = sn.body[0];
    const now = performance.now();

    for (const other of state.snakes) {
        if (other.id === sn.id || other.respawning || !other.body.length) continue;
        if (sn.id > other.id) continue; // process each pair only once per tick
        const otherHead = other.body[0];
        const dist = Math.abs(head.x - otherHead.x) + Math.abs(head.y - otherHead.y);

        // Use a sorted key so A→B and B→A share the same cooldown entry.
        const key = [sn.id, other.id].sort().join('-');
        if (!_greetPairState[key]) {
            _greetPairState[key] = { canGreet: true, nearSince: 0, chatted: false };
        }
        const pair = _greetPairState[key];

        if (dist > GREET_DISTANCE) {
            pair.nearSince = 0;
            pair.chatted = false;
            if (dist >= GREET_RESET_DISTANCE) pair.canGreet = true;
            continue;
        }

        if (!pair.nearSince) pair.nearSince = now;

        if (pair.canGreet) {
            const lastGreet = _greetCooldowns[key] || 0;
            if (now - lastGreet >= GREET_COOLDOWN_MS) {
                _greetCooldowns[key] = now;
                pair.canGreet = false;
                spawnThought(sn, THOUGHT_GREET, 2500);
                spawnThought(other, THOUGHT_GREET, 2500);
            }
        }

        if (!pair.chatted && now - pair.nearSince >= GREET_CHAT_AFTER_MS) {
            pair.chatted = true;
            spawnThought(sn, THOUGHT_CHAT, 2500);
            spawnThought(other, THOUGHT_CHAT, 2500);
        }
    }
}

function checkGrossFoodNearby(sn, now) {
    if (sn.respawning || !sn.body.length) return;
    if (now - (sn.lastGrossThoughtMs || 0) < GROSS_FOOD_COOLDOWN_MS) return;
    const head = sn.body[0];

    for (const other of state.snakes) {
        if (other.id === sn.id || other.respawning || !other.food) continue;
        const dist = Math.abs(head.x - other.food.x) + Math.abs(head.y - other.food.y);
        if (dist <= GROSS_FOOD_DISTANCE) {
            sn.lastGrossThoughtMs = now;
            spawnThought(sn, THOUGHT_GROSS, 2200);
            return;
        }
    }
}

// ---- Death handling ----
function handleSnakeDeath(sn) {
    // Count living (non-respawning) snakes after this one dies.
    const livingCount = state.snakes.filter(s => !s.respawning).length - 1;

    if (livingCount <= 0) {
        // Last (or only) living snake died → game over.
        triggerGameOver();
        return;
    }

    // Spawn a death thought before clearing the body.
    spawnThought(sn, THOUGHT_DEATH);
    for (const survivor of state.snakes) {
        if (survivor.id !== sn.id && !survivor.respawning && survivor.body.length) {
            spawnThought(survivor, THOUGHT_SAD);
        }
    }

    // Mark as respawning; body and food clear immediately.
    sn.respawning = true;
    sn.respawnAt = performance.now() + SNAKE_RESPAWN_DELAY_MS;
    sn.prevBody = [];
    sn.body = [];
    sn.food = null;
    sn.wandering = false;
    sn.wanderTarget = null;
    sn.satiety = 0;
    sn.trimCount = 0;
}

// ---- Respawn ----
// Called from loop.js when ts >= sn.respawnAt.
function respawnSnake(sn, ts) {
    const startBody = findRespawnPosition();
    if (!startBody) {
        // Grid is too full — retry after another delay.
        sn.respawnAt = ts + SNAKE_RESPAWN_DELAY_MS;
        return;
    }
    sn.body = startBody;
    sn.prevBody = startBody.map(c => ({ x: c.x, y: c.y }));
    sn.food = null;
    sn.nextDir = { x: 1, y: 0 };
    sn.satiety = 0;
    sn.wandering = false;
    sn.wanderTarget = null;
    sn.trimCount = 0;
    sn.lastTrimMs = 0;
    sn.thoughts = [];
    sn._desperationThisTick = false;
    sn.respawning = false;
    sn.respawnAt = 0;
    sn.lastTickMs = ts;
    sn.lastMoveMs = ts;
    sn.lastGrossThoughtMs = 0;
    placeFood(sn);
}

// ---- Find a starting position for a new or respawning snake ----
// Returns 3-cell body [{head}, {mid}, {tail}] or null if grid is too full.
function findRespawnPosition() {
    const grid = buildOccupiedGrid(false, true, null);
    const cols = state.cols, rows = state.rows;
    for (let attempt = 0; attempt < 50; attempt++) {
        const x = 1 + Math.floor(Math.random() * (cols - 3));
        const y = Math.floor(Math.random() * rows);
        if (!grid[y * cols + x] && !grid[y * cols + (x - 1)] && !grid[y * cols + (x - 2)]) {
            return [
                { x: x, y: y },
                { x: x - 1, y: y },
                { x: x - 2, y: y },
            ];
        }
    }
    return null;
}

// ---- Add / Remove snakes (called from UI) ----
function addSnake() {
    if (state.snakes.length >= MAX_SNAKES) return;
    const newId = state.snakes.length;
    const theme = state.theme || 'day';
    const color = (SNAKE_COLORS[theme] && SNAKE_COLORS[theme][newId])
        || SNAKE_COLORS.day[newId % SNAKE_COLORS.day.length];
    const startBody = findRespawnPosition();
    if (!startBody) return;     // no room
    const usedNames = new Set(state.snakes.map(s => s.displayName).filter(Boolean));
    const newName = pickRandomSnekName(usedNames);
    const newSn = makeSnake(newId, startBody, color, newName);
    state.snakes.push(newSn);
    placeFood(newSn);
    if (window._uiRebuildSnakeRows) window._uiRebuildSnakeRows();
}

function removeSnake(id) {
    if (state.snakes.length <= 1) return;   // never remove the last snake
    const idx = state.snakes.findIndex(sn => sn.id === id);
    if (idx === -1) return;
    state.snakes.splice(idx, 1);
    if (window._uiRebuildSnakeRows) window._uiRebuildSnakeRows();
}

// ---- Game over / complete ----
function triggerGameOver() {
    state.status = 'gameover';
    state.restartCountdown = RESTART_DELAY;
    startRestartCountdown();
}

function triggerComplete() {
    state.status = 'complete';
    state.restartCountdown = RESTART_DELAY;
    startRestartCountdown();
}

function startRestartCountdown() {
    clearInterval(state.restartTimer);
    state.restartTimer = setInterval(() => {
        state.restartCountdown--;
        if (state.restartCountdown <= 0) {
            clearInterval(state.restartTimer);
            state.restartTimer = null;
            initGame();
            document.getElementById('pauseBtn').textContent = 'Pause';
        }
    }, 1000);
}

function initGame() {
    clearInterval(state.restartTimer);
    state.restartTimer = null;

    const cx = Math.floor(state.cols / 2);
    const cy = Math.floor(state.rows / 2);
    if (state.cols < 1 || state.rows < 1) {
        const prev0 = state.snakes[0];
        const c0 = prev0 && prev0.userCustomized ? prev0.colorHead : null;
        state.snakes = [makeSnake(0, [], c0, pickRandomSnekName(new Set()))];
        if (prev0 && prev0.userCustomized) state.snakes[0].userCustomized = true;
        state.status = 'paused';
        if (window._uiRebuildSnakeRows) window._uiRebuildSnakeRows();
        return;
    }

    const startLen = Math.min(3, state.cols);
    const body = [];
    for (let i = 0; i < startLen; i++) {
        body.push({ x: cx - i, y: cy });
    }

    // Preserve user-customized snake 0 color across restarts; reset to single snake.
    const prevSnake = state.snakes[0];
    const carryColor = prevSnake && prevSnake.userCustomized ? prevSnake.colorHead : null;
    state.snakes = [makeSnake(0, body, carryColor, pickRandomSnekName(new Set()))];
    if (prevSnake && prevSnake.userCustomized) state.snakes[0].userCustomized = true;
    state.status = 'running';

    if (state.conway.enabled) conwayInit(true);

    placeFood(state.snakes[0]);

    // Rebuild color picker rows for the (now single-snake) roster.
    if (window._uiRebuildSnakeRows) window._uiRebuildSnakeRows();
}
