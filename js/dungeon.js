'use strict';

// ============================================================
// DUNGEON WALL SYSTEM
// ============================================================
// Generates organic wall patterns using multi-octave sine-product noise.
// Each call produces a completely different layout because all wave
// parameters (angle, frequency, phase) are randomised at generation time.
//
// Intensity 1 → ~5 % of cells are walls (a few scattered blobs).
// Intensity 10 → ~28 % of cells are walls (complex, interconnected shapes).

// Clear a square radius around the snake's starting centre so the snake
// never spawns inside a wall after a regen.
function clearStartZone(grid, cols, rows) {
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    const r = CONWAY_CLEAR_R;
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            const x = cx + dx, y = cy + dy;
            if (x >= 0 && x < cols && y >= 0 && y < rows) {
                grid[y * cols + x] = 0;
            }
        }
    }
}

// Flood-fill from (sx, sy) over open cells (value 0).
// Returns a Uint8Array where reachable[idx] === 1 for each reachable open cell.
function fillOpen(grid, cols, rows, sx, sy) {
    const reachable = new Uint8Array(grid.length);
    const stack = [sy * cols + sx];
    while (stack.length) {
        const idx = stack.pop();
        if (reachable[idx] || grid[idx] !== 0) continue;
        reachable[idx] = 1;
        const x = idx % cols, y = (idx / cols) | 0;
        if (x > 0) stack.push(idx - 1);
        if (x < cols - 1) stack.push(idx + 1);
        if (y > 0) stack.push(idx - cols);
        if (y < rows - 1) stack.push(idx + cols);
    }
    return reachable;
}

// Build an organic noise generation and return it as a Uint8Array (0=open, 1=wall).
//
// Algorithm: three octaves of angled sine-product waves.
// sin(wave_a) × sin(wave_b) creates amoeba-like interference blobs.
// Each pair of waves is randomly rotated so every regen looks different.
// A percentile threshold converts the continuous field into binary walls,
// guaranteeing exactly `wallFraction` of cells are solid regardless of
// the random wave parameters chosen for this generation.
function conwayBuildGeneration(cols, rows, intensity) {
    const size = cols * rows;
    const grid = new Uint8Array(size);

    const tLinear = (intensity - 1) / 9;
    const t = tLinear * tLinear * (3 - 2 * tLinear); // smoothstep 0→1

    // Target wall density: sparse at low intensity, complex at high intensity.
    const wallFraction = 0.05 + t * 0.23; // 5 % → 28 %

    // Three octaves: large blobs, medium detail, fine texture.
    // baseScale controls feature period: period ≈ 2π / baseScale (in cells).
    // At baseScale=0.18, period≈35 cells → blobs ~15 cells across.
    const OCTAVES = [
        { baseScale: 0.18, weight: 1.00 },
        { baseScale: 0.36, weight: 0.50 },
        { baseScale: 0.72, weight: 0.25 },
    ];

    // Build a random wave pair for each octave.
    // The two waves in each pair are 45–135° apart so their product creates
    // compact blobs rather than long stripes.
    const waves = OCTAVES.map(({ baseScale, weight }) => {
        const a1 = Math.random() * Math.PI * 2;
        const a2 = a1 + Math.PI / 4 + Math.random() * (Math.PI / 2);
        const s1 = baseScale * (0.7 + Math.random() * 0.6);
        const s2 = baseScale * (0.7 + Math.random() * 0.6);
        return {
            ax1: Math.cos(a1) * s1, ay1: Math.sin(a1) * s1,
            ax2: Math.cos(a2) * s2, ay2: Math.sin(a2) * s2,
            p1: Math.random() * Math.PI * 2,
            p2: Math.random() * Math.PI * 2,
            weight,
        };
    });

    // Evaluate the noise field at every cell.
    const values = new Float32Array(size);
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            let v = 0;
            for (const w of waves) {
                v += w.weight
                    * Math.sin(x * w.ax1 + y * w.ay1 + w.p1)
                    * Math.sin(x * w.ax2 + y * w.ay2 + w.p2);
            }
            values[y * cols + x] = v;
        }
    }

    // Sort a copy to find the exact percentile cutoff value.
    const sorted = Float32Array.from(values).sort();
    const cutoff = sorted[Math.max(0, Math.floor(size * wallFraction) - 1)];
    for (let i = 0; i < size; i++) grid[i] = values[i] <= cutoff ? 1 : 0;

    // Safety: clear snake spawn, then seal any unreachable open pockets.
    clearStartZone(grid, cols, rows);
    const reachable = fillOpen(grid, cols, rows, Math.floor(cols / 2), Math.floor(rows / 2));
    for (let i = 0; i < size; i++) {
        if (grid[i] === 0 && !reachable[i]) grid[i] = 1;
    }
    clearStartZone(grid, cols, rows);

    return grid;
}

// Build the next generation asynchronously so regen time does not stall rendering.
function conwaySchedulePendingGeneration() {
    const cw = state.conway;
    if (!cw.enabled) return;
    if (cw.pendingGen || cw.pendingBuildTimer) return;

    cw.pendingBuildTimer = setTimeout(() => {
        cw.pendingBuildTimer = 0;
        if (!cw.enabled) return;
        cw.pendingGen = conwayBuildGeneration(state.cols, state.rows, cw.intensity);
    }, 0);
}

function conwayEase(t) {
    const clamped = Math.min(1, Math.max(0, t));
    return clamped < 0.5
        ? 2 * clamped * clamped
        : -1 + (4 - 2 * clamped) * clamped;
}

// Returns the current eased fade amount [0..1].
function conwayCurrentEase(cw) {
    if (!cw) cw = state.conway;
    if (Number.isFinite(cw.fadeEase)) return cw.fadeEase;
    return conwayEase(cw.fadeProgress || 0);
}

// Returns the wall bitmap currently considered "solid" for gameplay.
// During crossfade, this flips from wallPrev to wallTarget at ease 0.5
// to preserve previous collision behavior (wallAlpha >= 0.5 threshold).
function conwayCurrentSolidGrid() {
    const cw = state.conway;
    if (!cw.wallTarget) return null;
    if (cw.fadeProgress < 1.0 && cw.wallPrev) {
        return conwayCurrentEase(cw) < 0.5 ? cw.wallPrev : cw.wallTarget;
    }
    return cw.wallTarget;
}

function conwayCellIsBlocked(idx, includeTargetWalls) {
    const cw = state.conway;
    if (!cw.enabled || !cw.wallTarget) return false;
    const solid = conwayCurrentSolidGrid();
    return !!((solid && solid[idx]) || (includeTargetWalls && cw.wallTarget[idx]));
}

// Initialise Conway dungeon mode.
// fresh=true: apply the first generation directly (no crossfade).
// fresh=false: queue a crossfade from the current state to a new generation.
function conwayInit(fresh, prebuiltGen) {
    const { cols, rows } = state;
    const size = cols * rows;
    const cw = state.conway;

    const newGen = prebuiltGen || conwayBuildGeneration(cols, rows, cw.intensity);
    cw.pendingGen = null;

    // Invalidate wall render caches before any crossfade.
    wallCache.dirty = true;
    wallCache.fade = null;

    if (fresh || !cw.wallTarget) {
        cw.wallPrev = new Uint8Array(size);
    } else {
        // Snapshot the current solid view as the outgoing generation.
        const current = conwayCurrentSolidGrid();
        const snapPrev = new Uint8Array(size);
        if (current) snapPrev.set(current);
        cw.wallPrev = snapPrev;
    }

    cw.wallTarget = newGen;
    cw.fadeProgress = 0;
    cw.fadeEase = 0;
    cw.fadeStartMs = performance.now();

    cw.nextRegenMs = performance.now() + cw.regenMs;
    conwaySchedulePendingGeneration();
}

// Update Conway crossfade timing.
// Called every frame from the render loop for smooth animation independent of tick speed.
function conwayUpdateFade(nowMs) {
    const cw = state.conway;
    if (!cw.enabled || !cw.wallTarget) return;

    if (nowMs >= cw.nextRegenMs) {
        conwayInit(false, cw.pendingGen); // triggers a new crossfade; prebuilt when available
    }

    if (cw.fadeProgress < 1.0) {
        cw.fadeProgress = Math.min(1.0, (nowMs - cw.fadeStartMs) / CONWAY_FADE_MS);
    }
    cw.fadeEase = conwayEase(cw.fadeProgress);
}

// Reset all Conway wall state when the mode is turned off.
function conwayClear() {
    const cw = state.conway;
    if (cw.pendingBuildTimer) clearTimeout(cw.pendingBuildTimer);
    cw.pendingBuildTimer = 0;
    cw.pendingGen = null;
    cw.wallAlpha = null;
    cw.wallTarget = null;
    cw.wallPrev = null;
    cw.fadeProgress = 1.0;
    cw.fadeEase = 1.0;
    cw.nextRegenMs = 0;
    wallCache.fade = null;
}
