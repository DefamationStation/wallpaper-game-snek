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
const THOUGHT_RESPAWN = ['\u{1F389}', '\u{1F973}', '\u2728'];
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

function getNextSnakeId() {
    if (!Number.isInteger(state.nextSnakeId) || state.nextSnakeId < 0) {
        state.nextSnakeId = 0;
    }
    while (state.snakes.some(sn => sn.id === state.nextSnakeId)) {
        state.nextSnakeId++;
    }
    const id = state.nextSnakeId;
    state.nextSnakeId++;
    return id;
}

// Spawn a chat-bubble thought above the snake's head.
// The thought follows the snake's head for its lifetime.
// pool: array of emojis to pick from.
// lifetime: ms the bubble stays (default 2000). Use longer values for persistent mood states.
// opts.tint: optional rgba string for colored bubble background (default white).
// opts.tag: optional string key; only one thought with a given tag can exist at a time.
//   Re-spawning with the same tag refreshes the existing thought instead of adding a new one.
function spawnThought(sn, pool, lifetime, opts) {
    if (!sn.body.length) return;
    const now = performance.now();
    const tag = opts && opts.tag;
    const tint = opts && opts.tint;
    const ttl = lifetime || 2000;
    const poolSig = pool && pool.length ? pool.join('\u0001') : '';
    const shadowTint = tint ? tint.replace(/[\d.]+\)$/, '0.3)') : null;
    // If a tag is provided, refresh the existing tagged thought instead of stacking.
    if (tag) {
        for (const t of sn.thoughts) {
            if (t.tag === tag) {
                // Keep tagged thoughts visually stable while the state stays active.
                // Do not hard-reset born every tick (that causes pop-in jitter).
                t.lifetime = ttl;
                t.tint = tint || null;
                t.shadowTint = shadowTint;
                if (pool && pool.length && t.poolSig !== poolSig) {
                    t.emoji = pool[Math.floor(Math.random() * pool.length)];
                }
                t.poolSig = poolSig;
                const age = now - t.born;
                if (age > ttl * 0.8) t.born = now - ttl * 0.8;
                return;
            }
        }
    }
    sn.thoughts.push({
        emoji: pool[Math.floor(Math.random() * pool.length)],
        born: now,
        lifetime: ttl,
        tint: tint || null,
        shadowTint: shadowTint,
        poolSig: poolSig,
        tag: tag || null,
    });
}

// Remove all thoughts with a specific tag from a snake.
function clearTaggedThought(sn, tag) {
    sn.thoughts = sn.thoughts.filter(t => t.tag !== tag);
}

// Pick a personality weighted toward variety.
// Each personality already assigned to a living snake has its weight halved,
// so unrepresented types are strongly favoured.
function pickPersonality() {
    const counts = {};
    for (const p of PERSONALITIES) counts[p] = 0;
    for (const sn of state.snakes) counts[sn.personality] = (counts[sn.personality] || 0) + 1;

    // Base weight 1.0; halve for each existing snake with that personality.
    const weights = PERSONALITIES.map(p => Math.pow(0.5, counts[p]));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return PERSONALITIES[i];
    }
    return PERSONALITIES[PERSONALITIES.length - 1];
}

// Factory for a fresh snake object. id: integer identifier (0 = primary).
// colorHead: optional hex string; falls back to SNAKE_COLORS[theme][id] or palette default.
function makeSnake(id, body, colorHead, displayName) {
    const theme = state.theme || 'day';
    const palette = SNAKE_COLORS[theme] || [];
    const defaultColor = palette.length
        ? palette[id % palette.length]
        : PALETTES[theme].snakeHead;
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
        // personality (persists across respawns, weighted toward variety)
        personality: pickPersonality(),
        // active behavior state (set by AI each tick, used for visual indicators)
        // null = normal, 'killing' = aggressive hunt, 'feared' = being hunted,
        // 'evading' = cautious fleeing, 'stealing' = greedy targeting other food
        _behaviorState: null,
        _behaviorTarget: null,   // id of the snake being targeted (for killing/feared pair)
        _behaviorVisualState: null,
        _behaviorVisualUntilMs: 0,
        greedyStealActive: false,
        greedyStealTargetSnakeId: null,
        aggressiveRetaliationTargetSnakeId: null,
        aggressiveRetaliationUntilMs: 0,
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
        lastDecayMs: 0,         // greedy personality: steady segment decay timer
        // respawn state
        respawning: false,
        corpseFadeStartMs: 0,
        respawnAt: 0,
    };
}

// Pick the nearest other snake (with food) for greedy steal mode.
// Returns true if a target was assigned.
function assignGreedyStealTarget(sn, fromPos) {
    const head = fromPos || sn.body[0];
    if (!head) return false;
    let best = null;
    let bestDist = Infinity;
    for (const other of state.snakes) {
        if (other.id === sn.id || other.respawning || !other.food) continue;
        const dist = Math.abs(head.x - other.food.x) + Math.abs(head.y - other.food.y);
        if (dist < bestDist) {
            bestDist = dist;
            best = other;
        }
    }
    sn.greedyStealTargetSnakeId = best ? best.id : null;
    return !!best;
}

// ---- Per-snake game tick ----
// Called by loop.js once per tick for each living (non-respawning) snake.
// Returns true when this tick changed the snake's segment count.
function gameTickForSnake(sn) {
    if (state.status !== 'running') return;
    const lenBefore = sn.body.length;

    const now = performance.now();

    // ---- Wander mode management ----
    if (sn.wandering) {
        const elapsed = now - sn.wanderStartMs;

        // Lose 1 tail segment every WANDER_TRIM_INTERVAL_MS, up to personality trim cap.
        const trimCap = PERSONALITY_META[sn.personality]?.wanderTrims ?? WANDER_MAX_TRIMS;
        if (sn.trimCount < trimCap &&
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

    // ---- Greedy steady decay: lose 1 segment every 20s ----
    if (sn.personality === 'greedy' &&
        sn.body.length > GREEDY_MIN_LENGTH &&
        now - sn.lastDecayMs >= GREEDY_DECAY_INTERVAL_MS) {
        sn.body.pop();
        sn.lastDecayMs = now;
    }

    // If a wall has faded in (or is fading in) over the food cell, relocate it.
    if (sn.food && state.conway.enabled && state.conway.wallTarget) {
        const fi = sn.food.y * state.cols + sn.food.x;
        const blocked = conwayCellIsBlocked(fi, true);
        if (blocked) placeFood(sn);
    }

    sn._desperationThisTick = false;
    sn.nextDir = computeNextDirection(sn);

    // Show tight-space thought if desperation AI fired this tick.
    if (sn._desperationThisTick) spawnThought(sn, THOUGHT_TIGHT);

    // ---- Behavior state visual indicators ----
    // Spawn persistent colored bubbles for active behavior states; clear when state ends.
    const _bState = sn._behaviorState;
    if (_bState && BEHAVIOR_TINTS[_bState]) {
        sn._behaviorVisualState = _bState;
        sn._behaviorVisualUntilMs = now + 500;
        spawnThought(sn, BEHAVIOR_EMOJIS[_bState] || ['❓'], 900, {
            tint: BEHAVIOR_TINTS[_bState],
            tag: 'behavior',
        });
    } else if (sn._behaviorVisualState && now <= sn._behaviorVisualUntilMs) {
        const vis = sn._behaviorVisualState;
        spawnThought(sn, BEHAVIOR_EMOJIS[vis] || ['❓'], 900, {
            tint: BEHAVIOR_TINTS[vis],
            tag: 'behavior',
        });
    } else {
        sn._behaviorVisualState = null;
        sn._behaviorVisualUntilMs = 0;
        clearTaggedThought(sn, 'behavior');
    }

    const head = sn.body[0];
    const newHead = { x: head.x + sn.nextDir.x, y: head.y + sn.nextDir.y };

    if (!inBounds(newHead.x, newHead.y)) { handleSnakeDeath(sn); return false; }

    // Collision check: other snakes' bodies (and own body minus tail) are walls.
    const occupied = buildOccupiedGrid(false, false, sn);
    const tail = sn.body[sn.body.length - 1];
    occupied[tail.y * state.cols + tail.x] = 0;   // tail vacates this tick
    if (occupied[newHead.y * state.cols + newHead.x]) { handleSnakeDeath(sn); return false; }

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
            return sn.body.length !== lenBefore;
        } else {
            placeFood(sn);
        }

        // Increment satiety; enter wander mode at personality-specific threshold.
        const wanderThreshold = PERSONALITY_META[sn.personality]?.wanderSatiety ?? SATIETY_MAX;
        if (!sn.wandering) {
            sn.satiety++;
            if (sn.satiety >= wanderThreshold) {
                sn.satiety = 0;
                sn.wandering = true;
                sn.wanderStartMs = performance.now();
                sn.lastTrimMs = performance.now();
                sn.trimCount = 0;
                spawnThought(sn, THOUGHT_FULL, 4000);
            }
        }

        // Greedy steal mode trigger: only roll when a greedy snake eats.
        if (sn.personality === 'greedy' && !sn.wandering && !sn.greedyStealActive) {
            if (Math.random() < GREEDY_STEAL_TRIGGER_CHANCE) {
                sn.greedyStealActive = assignGreedyStealTarget(sn, newHead);
            }
        }
    }

    // ---- Greedy: eat other snakes' food on contact ----
    if (sn.personality === 'greedy' && sn.greedyStealActive) {
        const target = state.snakes.find(s =>
            s.id === sn.greedyStealTargetSnakeId &&
            !s.respawning &&
            s.food
        );
        if (!target) {
            sn.greedyStealActive = false;
            sn.greedyStealTargetSnakeId = null;
        } else if (newHead.x === target.food.x && newHead.y === target.food.y) {
            sn.body.push({ ...sn.body[sn.body.length - 1] });
            spawnThought(sn, ['😋', '🍽️']);
            if (target.personality === 'aggressive') {
                target.aggressiveRetaliationTargetSnakeId = sn.id;
                target.aggressiveRetaliationUntilMs = now + AGGRESSIVE_RETALIATE_DURATION_MS;
                // Retaliation overrides passive roam behavior immediately.
                target.wandering = false;
                target.wanderTarget = null;
            }
            placeFood(target);
            sn.greedyStealActive = false;
            sn.greedyStealTargetSnakeId = null;
        }
    }

    // ---- Proximity greeting ----
    // When this snake's head is within GREET_DISTANCE cells of another snake's head,
    // both snakes show a greeting thought (with a cooldown to avoid spam).
    checkGreetings(sn);
    checkGrossFoodNearby(sn, now);
    return sn.body.length !== lenBefore;
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
    if (sn.personality === 'greedy') return;
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

    // Spawn a death thought; corpse stays in-place as a temporary obstacle.
    const now = performance.now();
    spawnThought(sn, THOUGHT_DEATH);
    for (const survivor of state.snakes) {
        if (survivor.id !== sn.id && !survivor.respawning && survivor.body.length) {
            if (survivor.personality !== 'aggressive') {
                spawnThought(survivor, THOUGHT_SAD);
            }
        }
    }

    // Mark as respawning but keep the body for a timed corpse phase:
    // 0-5s: fully visible and collidable, 5-10s: visually fades, still collidable.
    sn.respawning = true;
    sn.corpseFadeStartMs = now + SNAKE_CORPSE_HOLD_MS;
    sn.respawnAt = now + SNAKE_RESPAWN_DELAY_MS;
    sn.prevBody = sn.body.map(c => ({ x: c.x, y: c.y }));
    sn.food = null;
    sn.wandering = false;
    sn.wanderTarget = null;
    sn.satiety = 0;
    sn.trimCount = 0;
    sn.lastMoveMs = now;
    sn.greedyStealActive = false;
    sn.greedyStealTargetSnakeId = null;
    sn.aggressiveRetaliationTargetSnakeId = null;
    sn.aggressiveRetaliationUntilMs = 0;
}

// ---- Respawn ----
// Called from loop.js when ts >= sn.respawnAt.
function respawnSnake(sn, ts) {
    const startBody = findRespawnPosition();
    if (!startBody) {
        // Grid is too full - retry after another delay.
        sn.body = [];
        sn.prevBody = [];
        sn.corpseFadeStartMs = 0;
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
    sn.corpseFadeStartMs = 0;
    sn.respawnAt = 0;
    sn._behaviorState = null;
    sn._behaviorTarget = null;
    sn._behaviorVisualState = null;
    sn._behaviorVisualUntilMs = 0;
    sn.greedyStealActive = false;
    sn.greedyStealTargetSnakeId = null;
    sn.aggressiveRetaliationTargetSnakeId = null;
    sn.aggressiveRetaliationUntilMs = 0;
    sn.lastTickMs = ts;
    sn.lastMoveMs = ts;
    sn.lastGrossThoughtMs = 0;
    sn.lastDecayMs = ts;
    // personality is intentionally preserved across respawns
    placeFood(sn);

    // Celebrate successful respawn.
    spawnThought(sn, THOUGHT_RESPAWN, 2600);
    for (const other of state.snakes) {
        if (other.id === sn.id || other.respawning || !other.body.length) continue;
        spawnThought(other, THOUGHT_RESPAWN, 2200);
    }
}

// ---- Find a starting position for a new or respawning snake ----
// Returns body [{head}, ...] with length 1-3 depending on board width.
function findRespawnPosition() {
    const cols = state.cols, rows = state.rows;
    if (cols < 1 || rows < 1) return null;

    const grid = buildOccupiedGrid(false, true, null);
    const len = Math.max(1, Math.min(3, cols));
    const minHeadX = len - 1;
    const maxHeadX = cols - 1;

    for (let attempt = 0; attempt < 50; attempt++) {
        const x = minHeadX + Math.floor(Math.random() * (maxHeadX - minHeadX + 1));
        const y = Math.floor(Math.random() * rows);
        let blocked = false;
        for (let i = 0; i < len; i++) {
            if (grid[y * cols + (x - i)]) {
                blocked = true;
                break;
            }
        }
        if (!blocked) {
            const body = [];
            for (let i = 0; i < len; i++) body.push({ x: x - i, y: y });
            return body;
        }
    }
    return null;
}

// ---- Add / Remove snakes (called from UI) ----
function addSnake() {
    if (state.snakes.length >= MAX_SNAKES) return;
    const newId = getNextSnakeId();
    const theme = state.theme || 'day';
    const palette = SNAKE_COLORS[theme] || SNAKE_COLORS.day;
    const color = palette[newId % palette.length];
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

    // Drop stale greeting state/cooldowns for the removed snake id.
    const sid = String(id);
    for (const key of Object.keys(_greetCooldowns)) {
        const parts = key.split('-');
        if (parts[0] === sid || parts[1] === sid) delete _greetCooldowns[key];
    }
    for (const key of Object.keys(_greetPairState)) {
        const parts = key.split('-');
        if (parts[0] === sid || parts[1] === sid) delete _greetPairState[key];
    }

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
        state.nextSnakeId = 1;
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
    state.nextSnakeId = 1;
    if (prevSnake && prevSnake.userCustomized) state.snakes[0].userCustomized = true;
    state.status = 'running';

    if (state.conway.enabled) conwayInit(true);

    placeFood(state.snakes[0]);

    // Rebuild color picker rows for the (now single-snake) roster.
    if (window._uiRebuildSnakeRows) window._uiRebuildSnakeRows();
}
