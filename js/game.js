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
const THOUGHT_GLOW = ['🌟', '✨'];
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

function scheduleNextGlowSeed(now) {
    const span = GLOW_SEED_MAX_DELAY_MS - GLOW_SEED_MIN_DELAY_MS;
    state.glowSeed.nextSpawnMs = now + GLOW_SEED_MIN_DELAY_MS + Math.floor(Math.random() * (span + 1));
}

function resetGlowSeed(now) {
    state.glowSeed.cell = null;
    scheduleNextGlowSeed(Number.isFinite(now) ? now : performance.now());
}

function placeGlowSeed(now) {
    const cols = state.cols, rows = state.rows;
    if (cols < 1 || rows < 1) {
        state.glowSeed.nextSpawnMs = now + GLOW_SEED_RETRY_DELAY_MS;
        return false;
    }

    const occupied = buildOccupiedGrid(false, true, null);
    for (const sn of state.snakes) {
        if (sn.food) occupied[sn.food.y * cols + sn.food.x] = 1;
    }
    let freeCount = 0;
    for (let i = 0; i < occupied.length; i++) if (!occupied[i]) freeCount++;
    if (!freeCount) {
        state.glowSeed.nextSpawnMs = now + GLOW_SEED_RETRY_DELAY_MS;
        return false;
    }

    let pick = Math.floor(Math.random() * freeCount);
    for (let i = 0; i < occupied.length; i++) {
        if (occupied[i]) continue;
        if (pick-- === 0) {
            state.glowSeed.cell = { x: i % cols, y: (i / cols) | 0 };
            state.glowSeed.nextSpawnMs = 0;
            // Give every living snake the same start time for the race.
            for (const sn of state.snakes) {
                if (!sn.respawning && sn.body.length) sn.lastTickMs = now;
            }
            return true;
        }
    }
    return false;
}

function updateGlowSeed(now) {
    const seed = state.glowSeed.cell;
    if (seed) {
        if (state.conway.enabled && state.conway.wallTarget) {
            const idx = seed.y * state.cols + seed.x;
            if (conwayCellIsBlocked(idx, true)) {
                state.glowSeed.cell = null;
                placeGlowSeed(now);
            }
        }
        return;
    }
    if (now >= state.glowSeed.nextSpawnMs) placeGlowSeed(now);
}

function collectGlowSeed(sn, now) {
    const tail = sn.body[sn.body.length - 1] || sn.body[0];
    if (!tail) return false;
    for (let i = 0; i < GLOW_SEED_SEGMENT_BONUS; i++) {
        sn.body.push({ x: tail.x, y: tail.y });
    }
    state.glowSeed.cell = null;
    scheduleNextGlowSeed(now);
    spawnThought(sn, THOUGHT_GLOW, 2_600);
    return true;
}

function selectGlowSeedWinner(plans) {
    const arrivals = plans.filter(plan => plan.ateGlowSeed);
    if (!arrivals.length) return null;
    return arrivals[Math.floor(Math.random() * arrivals.length)];
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
                // Re-pick emoji only when the source pool changes.
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
// personality: optional fixed personality; new snakes otherwise get a weighted random one.
function makeSnake(id, body, colorHead, displayName, personality) {
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
        // personality (persists across respawns, weighted toward variety when not fixed)
        personality: PERSONALITIES.includes(personality) ? personality : pickPersonality(),
        // active behavior state (set by AI each tick, used for visual indicators)
        // null = normal, 'killing' = aggressive hunt, 'feared' = being hunted,
        // 'evading' = cautious fleeing, 'stealing' = greedy targeting other food,
        // 'glow-seeking' = shared glow seed race
        _behaviorState: null,
        _behaviorTarget: null,   // id of the snake being targeted (for killing/feared pair)
        _behaviorVisualState: null,
        _behaviorVisualUntilMs: 0,
        greedyStealActive: false,
        greedyStealTargetSnakeId: null,
        aggressiveRetaliationTargetSnakeId: null,
        aggressiveRetaliationUntilMs: 0,
        aggressiveKillTargetSnakeId: null,
        aggressiveKillUntilMs: 0,
        cautiousEvadeTargetSnakeId: null,
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

// Prepare one move without changing the snake's position. The loop prepares
// all due snakes before it resolves collisions, so snake list order cannot
// decide which snake survives.
function prepareSnakeTick(sn, now) {
    if (state.status !== 'running') return null;
    const lenBefore = sn.body.length;

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
    // Stealing mode can tick slower than kill/fear chase mode; keep its bubble alive longer.
    const behaviorTtlMs = _bState === 'stealing' ? 1300 : 900;
    if (_bState && BEHAVIOR_TINTS[_bState]) {
        // A social thought can remain alive after a chase starts. Remove it so
        // incompatible thoughts, such as a hug during a hunt, do not stack.
        clearTaggedThought(sn, 'social');
        const behaviorTarget = state.snakes.find(other => other.id === sn._behaviorTarget);
        if (behaviorTarget) clearTaggedThought(behaviorTarget, 'social');
        sn._behaviorVisualState = _bState;
        sn._behaviorVisualUntilMs = now + 500;
        spawnThought(sn, BEHAVIOR_EMOJIS[_bState] || ['❓'], behaviorTtlMs, {
            tint: BEHAVIOR_TINTS[_bState],
            tag: 'behavior',
        });
    } else if (sn._behaviorVisualState && now <= sn._behaviorVisualUntilMs) {
        const vis = sn._behaviorVisualState;
        spawnThought(sn, BEHAVIOR_EMOJIS[vis] || ['❓'], behaviorTtlMs, {
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
    const ateFood = !!(sn.food &&
        newHead.x === sn.food.x &&
        newHead.y === sn.food.y);
    const glowSeed = state.glowSeed && state.glowSeed.cell;
    const ateGlowSeed = !!(glowSeed &&
        newHead.x === glowSeed.x &&
        newHead.y === glowSeed.y);
    return { sn, lenBefore, now, newHead, ateFood, ateGlowSeed };
}

// Apply one move after the group collision result is known.
function commitSnakeTick(plan) {
    const { sn, lenBefore, now, newHead, ateFood, ateGlowSeed } = plan;
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

    if (ateGlowSeed && state.glowSeed.cell &&
        state.glowSeed.cell.x === newHead.x && state.glowSeed.cell.y === newHead.y) {
        collectGlowSeed(sn, now);
        if (sn.body.length >= state.cols * state.rows) {
            triggerComplete();
            return sn.body.length !== lenBefore;
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
                target.aggressiveKillTargetSnakeId = null;
                target.aggressiveKillUntilMs = 0;
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

// Resolve a group of prepared moves against one shared board snapshot.
// All snakes that choose the same cell die. A head swap also causes both
// snakes to die because each current head remains occupied during resolution.
function findCollidingMovePlans(plans) {
    const dead = new Set();
    const destinationCounts = new Map();

    for (const plan of plans) {
        const { newHead } = plan;
        if (!inBounds(newHead.x, newHead.y)) {
            dead.add(plan);
            continue;
        }
        const key = newHead.y * state.cols + newHead.x;
        destinationCounts.set(key, (destinationCounts.get(key) || 0) + 1);
    }
    for (const plan of plans) {
        const key = plan.newHead.y * state.cols + plan.newHead.x;
        if ((destinationCounts.get(key) || 0) > 1) dead.add(plan);
    }
    for (let i = 0; i < plans.length; i++) {
        const a = plans[i];
        const aHead = a.sn.body[0];
        for (let j = i + 1; j < plans.length; j++) {
            const b = plans[j];
            const bHead = b.sn.body[0];
            if (a.newHead.x === bHead.x && a.newHead.y === bHead.y &&
                b.newHead.x === aHead.x && b.newHead.y === aHead.y) {
                dead.add(a);
                dead.add(b);
            }
        }
    }

    // A dead snake does not vacate its tail. Repeat until no new collision is
    // found because one failed move can block another planned tail entry.
    let changed = true;
    while (changed) {
        changed = false;
        const occupied = buildOccupiedGrid(false, false, null);
        for (const plan of plans) {
            if (dead.has(plan) || plan.ateFood) continue;
            const tail = plan.sn.body[plan.sn.body.length - 1];
            occupied[tail.y * state.cols + tail.x] = 0;
        }
        for (const plan of plans) {
            if (dead.has(plan)) continue;
            const idx = plan.newHead.y * state.cols + plan.newHead.x;
            if (occupied[idx]) {
                dead.add(plan);
                changed = true;
            }
        }
    }
    return dead;
}

// Called by loop.js for all living snakes that are due on this frame.
// Returns true when any successful move changed a segment count.
function gameTickForSnakes(snakes, now) {
    if (state.status !== 'running' || !snakes.length) return false;
    const plans = snakes.map(sn => prepareSnakeTick(sn, now)).filter(Boolean);
    const glowWinner = selectGlowSeedWinner(plans);
    const waiting = new Set();
    if (glowWinner) {
        for (const plan of plans) {
            if (plan.ateGlowSeed && plan !== glowWinner) waiting.add(plan);
        }
    }
    const activePlans = waiting.size ? plans.filter(plan => !waiting.has(plan)) : plans;
    const dead = findCollidingMovePlans(activePlans);
    if (dead.size) handleSnakeDeaths(Array.from(dead, plan => plan.sn));

    let changed = false;
    for (const plan of activePlans) {
        if (dead.has(plan) || state.status !== 'running') continue;
        if (commitSnakeTick(plan)) changed = true;
    }
    return changed;
}

// Keep a single-snake entry point for direct callers and tests.
function gameTickForSnake(sn) {
    return gameTickForSnakes([sn], performance.now());
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

        // Active behavior has priority over social behavior. Reset the social
        // timer and require the pair to separate before they can greet again.
        if (sn._behaviorState || other._behaviorState) {
            pair.nearSince = 0;
            pair.chatted = false;
            pair.canGreet = false;
            clearTaggedThought(sn, 'social');
            clearTaggedThought(other, 'social');
            continue;
        }

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
                spawnThought(sn, THOUGHT_GREET, 2500, { tag: 'social' });
                spawnThought(other, THOUGHT_GREET, 2500, { tag: 'social' });
            }
        }

        if (!pair.chatted && now - pair.nearSince >= GREET_CHAT_AFTER_MS) {
            pair.chatted = true;
            spawnThought(sn, THOUGHT_CHAT, 2500, { tag: 'social' });
            spawnThought(other, THOUGHT_CHAT, 2500, { tag: 'social' });
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
    handleSnakeDeaths([sn]);
}

// Mark simultaneous deaths as one event. This prevents the result from
// changing with the order in which dead snakes are processed.
function handleSnakeDeaths(deadSnakes) {
    const deaths = Array.from(new Set(deadSnakes)).filter(sn => !sn.respawning);
    if (!deaths.length) return;
    const living = state.snakes.filter(sn => !sn.respawning);
    if (deaths.length >= living.length) {
        triggerGameOver();
        return;
    }

    const now = performance.now();
    const deadIds = new Set(deaths.map(sn => sn.id));
    for (const sn of deaths) spawnThought(sn, THOUGHT_DEATH);
    for (const survivor of state.snakes) {
        if (!deadIds.has(survivor.id) && !survivor.respawning &&
            survivor.body.length && survivor.personality !== 'aggressive') {
            spawnThought(survivor, THOUGHT_SAD);
        }
    }

    for (const sn of deaths) {
        // Keep the body as a temporary obstacle during the corpse phase.
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
        sn.aggressiveKillTargetSnakeId = null;
        sn.aggressiveKillUntilMs = 0;
        sn.cautiousEvadeTargetSnakeId = null;
    }
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
    sn.aggressiveKillTargetSnakeId = null;
    sn.aggressiveKillUntilMs = 0;
    sn.cautiousEvadeTargetSnakeId = null;
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
    if (state.glowSeed && state.glowSeed.cell) {
        const seed = state.glowSeed.cell;
        grid[seed.y * cols + seed.x] = 1;
    }
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
    resetGlowSeed(performance.now());

    const cx = Math.floor(state.cols / 2);
    const cy = Math.floor(state.rows / 2);
    if (state.cols < 1 || state.rows < 1) {
        const prev0 = state.snakes[0];
        const c0 = prev0 && prev0.userCustomized ? prev0.colorHead : null;
        state.snakes = [makeSnake(0, [], c0, pickRandomSnekName(new Set()), DEFAULT_PERSONALITIES[0])];
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

    // Start with one snake for each default personality. Keep customized slot colors on restart.
    const customizedColors = new Map(state.snakes
        .filter(sn => sn.userCustomized)
        .map(sn => [sn.id, sn.colorHead]));
    const usedNames = new Set();
    state.snakes = [];
    state.nextSnakeId = 0;

    function appendDefaultSnake(personality, startBody) {
        const id = getNextSnakeId();
        const displayName = pickRandomSnekName(usedNames);
        usedNames.add(displayName);
        const carriedColor = customizedColors.get(id) || null;
        const sn = makeSnake(id, startBody, carriedColor, displayName, personality);
        sn.userCustomized = customizedColors.has(id);
        state.snakes.push(sn);
        return sn;
    }

    appendDefaultSnake(DEFAULT_PERSONALITIES[0], body);
    state.status = 'running';

    if (state.conway.enabled) conwayInit(true);

    for (let i = 1; i < DEFAULT_PERSONALITIES.length; i++) {
        const startBody = findRespawnPosition();
        if (!startBody) break;
        appendDefaultSnake(DEFAULT_PERSONALITIES[i], startBody);
    }

    for (const sn of state.snakes) placeFood(sn);

    // Rebuild color picker rows for the default personality roster.
    if (window._uiRebuildSnakeRows) window._uiRebuildSnakeRows();
}

