'use strict';

// ============================================================
// GAME LOOP
// ============================================================

let loopId = null;

function gameLoop(ts) {
    // Conway fade updates every frame for smooth animation independent of tick speed.
    if (state.conway.enabled) conwayUpdateFade(ts);

    let syncSegCounts = false;
    if (state.status === 'running') {
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
                if (gameTickForSnake(sn)) syncSegCounts = true;
            }
        }
    }

    render(ts);
    if (syncSegCounts && window._uiSyncSnakeSegCounts) window._uiSyncSnakeSegCounts();
    loopId = requestAnimationFrame(gameLoop);
}

function startLoop() {
    if (loopId !== null) return;
    loopId = requestAnimationFrame(gameLoop);
}
