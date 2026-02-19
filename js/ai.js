'use strict';

// ============================================================
// AI — PATHFINDING & DECISION
// ============================================================

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

// ---- Min-Heap (priority queue) ----
class MinHeap {
    constructor(scoreFn) { this._data = []; this._score = scoreFn; }

    push(item) { this._data.push(item); this._bubbleUp(this._data.length - 1); }

    pop() {
        const top = this._data[0];
        const last = this._data.pop();
        if (this._data.length > 0) { this._data[0] = last; this._sinkDown(0); }
        return top;
    }

    isEmpty() { return this._data.length === 0; }

    _bubbleUp(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this._score(this._data[p]) <= this._score(this._data[i])) break;
            [this._data[p], this._data[i]] = [this._data[i], this._data[p]];
            i = p;
        }
    }

    _sinkDown(i) {
        const n = this._data.length;
        while (true) {
            let s = i;
            const l = 2 * i + 1, r = 2 * i + 2;
            if (l < n && this._score(this._data[l]) < this._score(this._data[s])) s = l;
            if (r < n && this._score(this._data[r]) < this._score(this._data[s])) s = r;
            if (s === i) break;
            [this._data[s], this._data[i]] = [this._data[i], this._data[s]];
            i = s;
        }
    }
}

// ---- A* pathfinder ----
// Uses integer cell indices as keys (no string allocations).
// occupied: Uint8Array from buildOccupiedGrid.
// Returns array of {x, y} from start to goal inclusive, or null if unreachable.
function aStar(sx, sy, gx, gy, occupied) {
    const cols = state.cols, rows = state.rows;
    const h = (x, y) => Math.abs(x - gx) + Math.abs(y - gy);
    const goalIdx = gy * cols + gx;

    const INF = 0x7fffffff;
    const gScore = new Int32Array(cols * rows).fill(INF);
    const fScore = new Int32Array(cols * rows).fill(INF);
    const parent = new Int32Array(cols * rows).fill(-1);
    const closed = new Uint8Array(cols * rows);

    const startIdx = sy * cols + sx;
    gScore[startIdx] = 0;
    fScore[startIdx] = h(sx, sy);

    const heap = new MinHeap(n => fScore[n]);
    heap.push(startIdx);

    while (!heap.isEmpty()) {
        const cur = heap.pop();
        if (closed[cur]) continue;
        closed[cur] = 1;

        if (cur === goalIdx) {
            const path = [];
            let node = cur;
            while (node !== -1) {
                path.unshift({ x: node % cols, y: (node / cols) | 0 });
                node = parent[node];
            }
            return path;
        }

        const cx = cur % cols, cy = (cur / cols) | 0;
        for (const [dx, dy] of DIRS) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
            const nIdx = ny * cols + nx;
            if (closed[nIdx] || occupied[nIdx]) continue;
            const g = gScore[cur] + 1;
            if (g < gScore[nIdx]) {
                parent[nIdx] = cur;
                gScore[nIdx] = g;
                fScore[nIdx] = g + h(nx, ny);
                heap.push(nIdx);
            }
        }
    }
    return null;
}

// ---- Flood fill ----
// Returns the number of open cells reachable from (sx, sy).
function floodFillCount(sx, sy, occupied, cap) {
    const cols = state.cols, rows = state.rows;
    const visited = new Uint8Array(cols * rows);
    const stack = [sy * cols + sx];
    let count = 0;
    while (stack.length) {
        const idx = stack.pop();
        if (idx < 0 || idx >= cols * rows) continue;
        if (visited[idx] || occupied[idx]) continue;
        visited[idx] = 1;
        count++;
        if (cap && count >= cap) return count;
        const x = idx % cols, y = (idx / cols) | 0;
        if (x > 0) stack.push(idx - 1);
        if (x < cols - 1) stack.push(idx + 1);
        if (y > 0) stack.push(idx - cols);
        if (y < rows - 1) stack.push(idx + cols);
    }
    return count;
}

// ---- Direction decision ----
// Three-phase strategy:
//   1. A* to food — only if the next cell has enough reachable space.
//   2. Tail-follow — keeps the snake mobile; gated on space check.
//   3. Max-space fallback — pick the open neighbour with the most reachable cells.
// sn: the snake object to compute a direction for.
// Other snakes' bodies are treated as walls (via callerSn in buildOccupiedGrid).
function computeNextDirection(sn) {
    const head = sn.body[0];
    const tail = sn.body[sn.body.length - 1];
    const cols = state.cols;

    // excludeHead=true for caller; other snakes fully marked as walls.
    const occupied = buildOccupiedGrid(true, true, sn);
    // The tail will vacate this cell on the next tick, so treat it as free.
    occupied[tail.y * cols + tail.x] = 0;

    // Simulate the board after moving to (nx, ny): body present, tail freed.
    // Other snakes' bodies are included via callerSn=sn.
    const baseSim = buildOccupiedGrid(false, true, sn);
    baseSim[tail.y * cols + tail.x] = 0;
    function safeSpace(nx, ny, cap) {
        const sim = baseSim.slice();
        return floodFillCount(nx, ny, sim, cap);
    }

    // Phase 1: Head toward food — skipped entirely in wander mode.
    if (sn.food && !sn.wandering) {
        const foodPath = aStar(head.x, head.y, sn.food.x, sn.food.y, occupied);
        if (foodPath && foodPath.length > 1) {
            const next = foodPath[1];
            const need = sn.body.length + 4;
            if (safeSpace(next.x, next.y, need) >= need) {
                return { x: next.x - head.x, y: next.y - head.y };
            }
        }
    }

    // Phase 1b: In wander mode, navigate toward a random roam target.
    // Pick a new target when there isn't one, it was reached, or it became blocked.
    if (sn.wandering) {
        const occ = buildOccupiedGrid(false, true, sn);
        // Refresh target if missing, reached, or now occupied.
        if (!sn.wanderTarget ||
            (head.x === sn.wanderTarget.x && head.y === sn.wanderTarget.y) ||
            occ[sn.wanderTarget.y * cols + sn.wanderTarget.x]) {
            // Pick a random open cell, trying up to 30 candidates.
            let picked = null;
            for (let attempt = 0; attempt < 30; attempt++) {
                const rx = Math.floor(Math.random() * state.cols);
                const ry = Math.floor(Math.random() * state.rows);
                if (!occ[ry * cols + rx] && !(rx === head.x && ry === head.y)) {
                    picked = { x: rx, y: ry };
                    break;
                }
            }
            sn.wanderTarget = picked;
        }
        if (sn.wanderTarget) {
            const roamPath = aStar(head.x, head.y, sn.wanderTarget.x, sn.wanderTarget.y, occupied);
            if (roamPath && roamPath.length > 1) {
                const next = roamPath[1];
                const need = sn.body.length;
                if (safeSpace(next.x, next.y, need) >= need) {
                    return { x: next.x - head.x, y: next.y - head.y };
                }
            }
        }
    }

    // Phase 2: Chase tail to stay mobile — only in normal (non-wander) mode.
    if (!sn.wandering && sn.body.length > 1) {
        const tailPath = aStar(head.x, head.y, tail.x, tail.y, occupied);
        if (tailPath && tailPath.length > 1) {
            const next = tailPath[1];
            const need = sn.body.length;
            if (safeSpace(next.x, next.y, need) >= need) {
                return { x: next.x - head.x, y: next.y - head.y };
            }
        }
    }

    // Phase 3: No clean path — maximise reachable space from each open neighbour.
    // Signal desperation so gameTickForSnake can show a tight-space thought bubble.
    sn._desperationThisTick = true;
    let bestDir = null;
    let bestSpace = -1;
    for (const [dx, dy] of DIRS) {
        const nx = head.x + dx, ny = head.y + dy;
        if (!inBounds(nx, ny) || occupied[ny * cols + nx]) continue;
        const space = safeSpace(nx, ny);
        if (space > bestSpace) {
            bestSpace = space;
            bestDir = { x: dx, y: dy };
        }
    }
    if (bestDir) return bestDir;

    return sn.nextDir;
}
