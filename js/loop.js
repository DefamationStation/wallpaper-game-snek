'use strict';

// ============================================================
// GAME LOOP
// ============================================================

let loopId = null;

function gameLoop(ts) {
    // Conway fade updates every frame for smooth animation independent of tick speed.
    if (state.conway.enabled) conwayUpdateFade(ts);

    if (state.status === 'running') {
        for (const sn of state.snakes) {
            // Handle respawn scheduling for dead snakes.
            if (sn.respawning) {
                if (ts >= sn.respawnAt) respawnSnake(sn, ts);
                continue;
            }
            // Each snake ticks at its own rate (wander = half speed).
            const effectiveTickMs = sn.wandering
                ? state.tickMs * WANDER_SPEED_DIVISOR
                : state.tickMs;
            if (ts - sn.lastTickMs >= effectiveTickMs) {
                sn.lastTickMs = ts;
                gameTickForSnake(sn);
            }
        }
    }

    render(ts);
    loopId = requestAnimationFrame(gameLoop);
}

function startLoop() {
    if (loopId !== null) return;
    loopId = requestAnimationFrame(gameLoop);
}
