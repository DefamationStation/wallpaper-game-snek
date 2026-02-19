'use strict';

// ============================================================
// GRID HELPERS
// ============================================================

function toPixel(x, y) {
    return { px: x * CELL_SIZE, py: y * CELL_SIZE };
}

function inBounds(x, y) {
    return x >= 0 && x < state.cols && y >= 0 && y < state.rows;
}

// Returns a Uint8Array indexed by y * state.cols + x.
// 1 = occupied (snake segment or wall), 0 = free.
// callerSn: the snake requesting the grid. Its head is excluded when excludeHead=true.
//   All other snakes' bodies are always fully marked (no head exclusion for them).
//   Pass null/undefined to mark ALL snakes fully (e.g. for food placement).
// excludeHead: skip index 0 of callerSn's body (used by AI when computing moves).
// includeTargetWalls: incoming Conway target walls are treated as occupied too.
function buildOccupiedGrid(excludeHead, includeTargetWalls, callerSn) {
    const cols = state.cols, rows = state.rows;
    const grid = new Uint8Array(cols * rows);

    for (const sn of state.snakes) {
        const isCaller = callerSn && sn.id === callerSn.id;
        const start = (isCaller && excludeHead) ? 1 : 0;
        for (let i = start; i < sn.body.length; i++) {
            grid[sn.body[i].y * cols + sn.body[i].x] = 1;
        }
    }

    // Conway walls: treat a cell as solid if its alpha is >= 0.5 (visually a wall).
    // Optionally include incoming target walls for AI/path safety.
    if (state.conway.enabled && state.conway.wallAlpha) {
        const wa = state.conway.wallAlpha;
        const wt = state.conway.wallTarget;
        const size = cols * rows;
        for (let i = 0; i < size; i++) {
            if (wa[i] >= 0.5 || (includeTargetWalls && wt && wt[i])) grid[i] = 1;
        }
    }

    return grid;
}

// Place food for a specific snake on a uniformly random free cell.
// Avoids all snake bodies (including callerSn's own), Conway walls,
// and all other snakes' existing food cells.
function placeFood(sn) {
    const cols = state.cols, rows = state.rows;
    // Mark all snake bodies as occupied (null callerSn = no head exclusion for anyone).
    const grid = buildOccupiedGrid(false, true, null);
    // Also block cells already occupied by any other snake's food.
    for (const other of state.snakes) {
        if (other.food) grid[other.food.y * cols + other.food.x] = 1;
    }
    const totalCells = cols * rows;

    let freeCount = 0;
    for (let i = 0; i < totalCells; i++) if (!grid[i]) freeCount++;
    if (freeCount === 0) { sn.food = null; return; }

    let pick = Math.floor(Math.random() * freeCount);
    for (let i = 0; i < totalCells; i++) {
        if (!grid[i]) {
            if (pick-- === 0) {
                sn.food = { x: i % cols, y: (i / cols) | 0 };
                return;
            }
        }
    }
    sn.food = null;
}
