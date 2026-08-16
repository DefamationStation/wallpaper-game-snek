'use strict';

// ============================================================
// GAME LOOP
// ============================================================

let loopId = null;
let lastRenderFrameMs = 0;

function gameLoop(ts) {
    // Android wallpapers use a 30 fps render limit to reduce battery and heat.
    // Game ticks still run at their configured rate.
    const minRenderIntervalMs = Number(window._snekMinRenderIntervalMs) || 0;
    const shouldRender = minRenderIntervalMs <= 0 || ts - lastRenderFrameMs >= minRenderIntervalMs;

    // Conway fade follows the visible render rate.
    if (shouldRender && state.conway.enabled) conwayUpdateFade(ts);

    let syncSegCounts = false;
    if (state.status === 'running') {
        const dueSnakes = [];
        for (const sn of state.snakes) {
            // Handle respawn scheduling for dead snakes.
            if (sn.respawning) {
                if (ts >= sn.respawnAt) {
                    respawnSnake(sn, ts);
                    syncSegCounts = true;
                }
                continue;
            }
            // Each snake ticks at its own rate (wander = half speed, personality may tweak).
            // Chase speed boost: killing/feared snakes move faster during the chase.
            const personalitySpeed = PERSONALITY_META[sn.personality]?.speedMult ?? 1.0;
            const chaseBoost = (sn._behaviorState === 'killing' || sn._behaviorState === 'feared')
                ? CHASE_SPEED_MULT : 1.0;
            const effectiveTickMs = sn.wandering
                ? state.tickMs * WANDER_SPEED_DIVISOR
                : state.tickMs * personalitySpeed * chaseBoost;
            if (ts - sn.lastTickMs >= effectiveTickMs) {
                sn.lastTickMs = ts;
                dueSnakes.push(sn);
            }
        }
        if (dueSnakes.length && gameTickForSnakes(dueSnakes, ts)) syncSegCounts = true;
    }

    if (shouldRender) {
        render(ts);
        lastRenderFrameMs = ts;
    }
    if (syncSegCounts && window._uiSyncSnakeSegCounts) window._uiSyncSnakeSegCounts();
    loopId = requestAnimationFrame(gameLoop);
}

function startLoop() {
    if (loopId !== null) return;
    loopId = requestAnimationFrame(gameLoop);
}
