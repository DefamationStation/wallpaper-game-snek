'use strict';

// ============================================================
// AI — PATHFINDING & DECISION
// ============================================================

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const _astarCache = {
    size: 0,
    gScore: null,
    fScore: null,
    parent: null,
    closed: null,
};
const _floodCache = {
    marks: null,
    stack: [],
    stamp: 1,
};

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
    const size = cols * rows;

    const INF = 0x7fffffff;
    if (_astarCache.size !== size) {
        _astarCache.size = size;
        _astarCache.gScore = new Int32Array(size);
        _astarCache.fScore = new Int32Array(size);
        _astarCache.parent = new Int32Array(size);
        _astarCache.closed = new Uint8Array(size);
    }
    const gScore = _astarCache.gScore;
    const fScore = _astarCache.fScore;
    const parent = _astarCache.parent;
    const closed = _astarCache.closed;
    gScore.fill(INF);
    fScore.fill(INF);
    parent.fill(-1);
    closed.fill(0);

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
            const pathRev = [];
            let node = cur;
            while (node !== -1) {
                pathRev.push({ x: node % cols, y: (node / cols) | 0 });
                node = parent[node];
            }
            pathRev.reverse();
            return pathRev;
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
// extraBlockedIdx marks one additional blocked cell without cloning occupied.
function floodFillCount(sx, sy, occupied, cap, extraBlockedIdx) {
    const cols = state.cols, rows = state.rows;
    const size = cols * rows;
    if (!_floodCache.marks || _floodCache.marks.length !== size) {
        _floodCache.marks = new Uint32Array(size);
        _floodCache.stamp = 1;
    }
    _floodCache.stamp++;
    if (_floodCache.stamp === 0xffffffff) {
        _floodCache.marks.fill(0);
        _floodCache.stamp = 1;
    }

    const stamp = _floodCache.stamp;
    const marks = _floodCache.marks;
    const blockedIdx = Number.isInteger(extraBlockedIdx) ? extraBlockedIdx : -1;
    const stack = _floodCache.stack;
    stack.length = 0;
    stack.push(sy * cols + sx);

    let count = 0;
    while (stack.length) {
        const idx = stack.pop();
        if (idx < 0 || idx >= size) continue;
        if (idx === blockedIdx || occupied[idx]) continue;
        if (marks[idx] === stamp) continue;
        marks[idx] = stamp;
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
// Personality-aware multi-phase strategy:
//   Phase 0: Personality overrides (aggressive kill, cautious evasion, greedy steal)
//   Phase 1: A* to food — only if the next cell has enough reachable space.
//   Phase 1b: Wander-mode roaming toward a random target.
//   Phase 2: Tail-follow — keeps the snake mobile; gated on space check.
//   Phase 3: Max-space fallback — pick the open neighbour with the most reachable cells.
// sn: the snake object to compute a direction for.
// Other snakes' bodies are treated as walls (via callerSn in buildOccupiedGrid).
function computeNextDirection(sn) {
    const head = sn.body[0];
    const tail = sn.body[sn.body.length - 1];
    const cols = state.cols;
    const meta = PERSONALITY_META[sn.personality];
    const safetyMargin = meta ? meta.safetyMargin : 4;

    // Reset self-initiated behavior state each tick — phases below will set it if active.
    // Preserve 'feared' state set by another snake's aggressive AI (cleared below if no longer valid).
    if (sn._behaviorState !== 'feared') {
        sn._behaviorState = null;
        sn._behaviorTarget = null;
    } else {
        // Validate the feared state: clear if the aggressor is gone, dead, or no longer in kill mode.
        const aggressor = state.snakes.find(s => s.id === sn._behaviorTarget);
        if (!aggressor || aggressor.respawning || aggressor._behaviorState !== 'killing') {
            sn._behaviorState = null;
            sn._behaviorTarget = null;
        }
    }

    // excludeHead=true for caller; other snakes fully marked as walls.
    const occupied = buildOccupiedGrid(true, true, sn);
    // The tail will vacate this cell on the next tick, so treat it as free.
    occupied[tail.y * cols + tail.x] = 0;

    // Simulate the board after moving to (nx, ny): body present, tail freed.
    const baseSim = buildOccupiedGrid(false, true, sn);
    baseSim[tail.y * cols + tail.x] = 0;
    const pathCache = new Map();
    function safeSpace(nx, ny, cap) {
        return floodFillCount(nx, ny, baseSim, cap, -1);
    }

    // Cache A* paths by goal cell for this decision pass.
    function getPathTo(gx, gy) {
        const key = gy * cols + gx;
        if (pathCache.has(key)) return pathCache.get(key);
        const path = aStar(head.x, head.y, gx, gy, occupied);
        pathCache.set(key, path);
        return path;
    }

    // Helper: attempt to pathfind to a goal and return a direction if safe.
    function tryPathTo(gx, gy, margin) {
        const path = getPathTo(gx, gy);
        if (path && path.length > 1) {
            const next = path[1];
            const need = sn.body.length + margin;
            if (safeSpace(next.x, next.y, need) >= need) {
                return { x: next.x - head.x, y: next.y - head.y };
            }
        }
        return null;
    }

    // ================================================================
    // Phase 0a: AGGRESSIVE — kill mode
    // When another snake's head is near our food, try to block them in
    // or chase them for a direct head-to-body collision.
    // ================================================================
    if (sn.personality === 'aggressive' && !sn.wandering && state.snakes.length > 1) {
        let target = null;
        let targetDist = Infinity;
        for (const other of state.snakes) {
            if (other.id === sn.id || other.respawning || !other.body.length) continue;
            if (!sn.food) break;
            const oh = other.body[0];
            const dist = Math.abs(oh.x - sn.food.x) + Math.abs(oh.y - sn.food.y);
            if (dist <= AGGRESSIVE_KILL_RANGE && dist < targetDist) {
                target = other;
                targetDist = dist;
            }
        }
        if (target && Math.random() < AGGRESSIVE_KILL_CHANCE) {
            sn._behaviorState = 'killing';
            sn._behaviorTarget = target.id;
            // Mark the victim as feared.
            target._behaviorState = 'feared';
            target._behaviorTarget = sn.id;

            const th = target.body[0];

            // Strategy 1: Block — find the neighbor of target's head that minimizes
            // their reachable space.
            let bestBlockDir = null;
            let bestBlockScore = Infinity;
            for (const [dx, dy] of DIRS) {
                const bx = th.x + dx, by = th.y + dy;
                if (!inBounds(bx, by) || occupied[by * cols + bx]) continue;
                const blockIdx = by * cols + bx;
                const targetSpace = floodFillCount(th.x, th.y, baseSim, 0, blockIdx);
                if (targetSpace < bestBlockScore) {
                    bestBlockScore = targetSpace;
                    bestBlockDir = { bx, by };
                }
            }
            if (bestBlockDir) {
                const dir = tryPathTo(bestBlockDir.bx, bestBlockDir.by, safetyMargin);
                if (dir) return dir;
            }

            // Strategy 2: Direct chase — pathfind toward the target's head.
            // If close enough, try to collide with their body.
            const headDist = Math.abs(head.x - th.x) + Math.abs(head.y - th.y);
            if (headDist <= AGGRESSIVE_KILL_RANGE + 2) {
                const dir = tryPathTo(th.x, th.y, safetyMargin);
                if (dir) return dir;
            }
        }
    }

    // ================================================================
    // Phase 0b: CAUTIOUS — evasion mode
    // When any other snake's head is too close, flee instead of eating.
    // ================================================================
    if (sn.personality === 'cautious' && !sn.wandering && state.snakes.length > 1) {
        let nearestThreat = null;
        let nearestDist = Infinity;
        for (const other of state.snakes) {
            if (other.id === sn.id || other.respawning || !other.body.length) continue;
            const oh = other.body[0];
            const dist = Math.abs(head.x - oh.x) + Math.abs(head.y - oh.y);
            if (dist <= CAUTIOUS_EVADE_RANGE && dist < nearestDist) {
                nearestThreat = other;
                nearestDist = dist;
            }
        }
        if (nearestThreat) {
            sn._behaviorState = 'evading';
            sn._behaviorTarget = nearestThreat.id;
            // Move to the open neighbor that maximizes distance from the threat.
            const th = nearestThreat.body[0];
            let bestEvadeDir = null;
            let bestEvadeDist = -1;
            let bestEvadeSpace = -1;
            for (const [dx, dy] of DIRS) {
                const nx = head.x + dx, ny = head.y + dy;
                if (!inBounds(nx, ny) || occupied[ny * cols + nx]) continue;
                const distFromThreat = Math.abs(nx - th.x) + Math.abs(ny - th.y);
                const space = safeSpace(nx, ny, sn.body.length + safetyMargin);
                if (space < sn.body.length) continue; // not safe enough
                if (distFromThreat > bestEvadeDist ||
                    (distFromThreat === bestEvadeDist && space > bestEvadeSpace)) {
                    bestEvadeDist = distFromThreat;
                    bestEvadeSpace = space;
                    bestEvadeDir = { x: dx, y: dy };
                }
            }
            if (bestEvadeDir) return bestEvadeDir;
            // If no evasion direction is safe, fall through to normal phases.
        }
    }

    // ================================================================
    // Phase 0c: GREEDY — steal mode (armed after an eat-trigger roll in game.js).
    // Once active, stays on until this snake eats the chosen nearest target food.
    // ================================================================
    if (sn.personality === 'greedy' && !sn.wandering && sn.greedyStealActive) {
        let target = state.snakes.find(s =>
            s.id === sn.greedyStealTargetSnakeId &&
            !s.respawning &&
            s.food
        );

        // If target vanished (removed/dead/no food), retarget nearest available food.
        if (!target) {
            let nearest = null;
            let nearestDist = Infinity;
            for (const other of state.snakes) {
                if (other.id === sn.id || other.respawning || !other.food) continue;
                const dist = Math.abs(head.x - other.food.x) + Math.abs(head.y - other.food.y);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearest = other;
                }
            }
            if (nearest) {
                target = nearest;
                sn.greedyStealTargetSnakeId = nearest.id;
            } else {
                sn.greedyStealActive = false;
                sn.greedyStealTargetSnakeId = null;
            }
        }

        if (target && target.food) {
            sn._behaviorState = 'stealing';
            sn._behaviorTarget = target.id;
            const dir = tryPathTo(target.food.x, target.food.y, safetyMargin);
            if (dir) return dir;
        }
    }

    // ================================================================
    // Phase 1: Head toward own food — skipped entirely in wander mode.
    // Safety margin is personality-dependent.
    // ================================================================
    if (sn.food && !sn.wandering) {
        const dir = tryPathTo(sn.food.x, sn.food.y, safetyMargin);
        if (dir) return dir;
    }

    // Phase 1b: In wander mode, navigate toward a random roam target.
    // Pick a new target when there isn't one, it was reached, or it became blocked.
    if (sn.wandering) {
        const occ = buildOccupiedGrid(false, true, sn);
        // Refresh target if missing, reached, or now occupied.
        if (!sn.wanderTarget ||
            (head.x === sn.wanderTarget.x && head.y === sn.wanderTarget.y) ||
            occ[sn.wanderTarget.y * cols + sn.wanderTarget.x]) {
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
            const roamPath = getPathTo(sn.wanderTarget.x, sn.wanderTarget.y);
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
        const tailPath = getPathTo(tail.x, tail.y);
        if (tailPath && tailPath.length > 1) {
            const next = tailPath[1];
            const need = sn.body.length;
            if (safeSpace(next.x, next.y, need) >= need) {
                return { x: next.x - head.x, y: next.y - head.y };
            }
        }
    }

    // Phase 3: No clean path — maximise reachable space from each open neighbour.
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
