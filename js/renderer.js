'use strict';

// ============================================================
// RENDERER
// ============================================================

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// Draw a rounded rectangle path on ctx (does not fill/stroke itself).
function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

function drawEyes(headCell, dir) {
    const { px, py } = toPixel(headCell.x, headCell.y);
    const cx = px + CELL_SIZE * 0.5;
    const cy = py + CELL_SIZE * 0.5;
    const fwd = CELL_SIZE * 0.18;
    const side = CELL_SIZE * 0.18;
    const r = CELL_SIZE * 0.11;
    const pr = CELL_SIZE * 0.045;
    const perp = { x: -dir.y, y: dir.x };

    const eyes = [
        { x: cx + dir.x * fwd + perp.x * side, y: cy + dir.y * fwd + perp.y * side },
        { x: cx + dir.x * fwd - perp.x * side, y: cy + dir.y * fwd - perp.y * side },
    ];

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const e of eyes) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = 'rgba(40,40,40,0.8)';
    for (const e of eyes) {
        ctx.beginPath();
        ctx.arc(e.x + dir.x * pr, e.y + dir.y * pr, pr * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ---- Thought bubbles ----
// Draws a chat-cloud speech bubble following the snake's head for each active thought.
// Bubbles appear instantly, stay for most of the lifetime, then fade out in the last 25%.
function drawThoughts(sn, nowMs) {
    if (!sn.thoughts.length || !sn.body.length) return;
    const body = sn.body;
    const prevBody = sn.prevBody || body;
    const personalitySpeed = PERSONALITY_META[sn.personality]?.speedMult ?? 1.0;
    const chaseBoost = (sn._behaviorState === 'killing' || sn._behaviorState === 'feared') ? CHASE_SPEED_MULT : 1.0;
    const effectiveTickMs = sn.wandering ? state.tickMs * WANDER_SPEED_DIVISOR : state.tickMs * personalitySpeed * chaseBoost;
    const moveProgress = effectiveTickMs > 0
        ? Math.min(1, Math.max(0, (nowMs - (sn.lastMoveMs || nowMs)) / effectiveTickMs))
        : 1;
    const interp = state.smoothMovement ? moveProgress : 1;
    const headCur = body[0];
    const headPrev = prevBody[0] || headCur;
    const headX = headPrev.x + (headCur.x - headPrev.x) * interp;
    const headY = headPrev.y + (headCur.y - headPrev.y) * interp;

    let write = 0;
    let behaviorIdx = -1;
    for (let read = 0; read < sn.thoughts.length; read++) {
        const t = sn.thoughts[read];
        const age = nowMs - t.born;
        if (age >= t.lifetime) continue; // expired â€” drop it
        sn.thoughts[write] = t;
        if (behaviorIdx === -1 && t.tag === 'behavior') behaviorIdx = write;
        write++;
    }
    sn.thoughts.length = write;
    if (!write) return;

    // Keep behavior bubble anchored nearest the head to avoid apparent flicker.
    for (let stackIndex = 0; stackIndex < write; stackIndex++) {
        let idx = stackIndex;
        if (behaviorIdx !== -1) {
            if (stackIndex === 0) idx = behaviorIdx;
            else if (stackIndex <= behaviorIdx) idx = stackIndex - 1;
        }
        const t = sn.thoughts[idx];
        const age = nowMs - t.born;
        const progress = age / t.lifetime;
        const fadeStart = 0.75;
        const isBehavior = t.tag === 'behavior';
        let alpha = 1;
        let scale = 1;
        if (!isBehavior && progress < 0.08) {
            scale = progress / 0.08;
        }
        if (!isBehavior && progress > fadeStart) {
            alpha = 1 - (progress - fadeStart) / (1 - fadeStart);
        }

        const px = headX * CELL_SIZE;
        const py = headY * CELL_SIZE;
        const cx = px + CELL_SIZE / 2;
        const cy = py;

        const fontSize = Math.round(CELL_SIZE * 1.15);
        const pad = 5;
        const bubbleW = fontSize + pad * 2;
        const bubbleH = fontSize + pad * 1.6;
        const tailH = 6;
        const r = 8;
        const bx = cx - bubbleW / 2;
        const stackOffset = stackIndex * (bubbleH + 4);
        const by = cy - bubbleH - tailH - CELL_SIZE * 0.2 - stackOffset;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx, by + bubbleH / 2);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -(by + bubbleH / 2));

        const bubbleTint = t.tint || 'rgba(255,255,255,0.92)';
        ctx.shadowColor = t.shadowTint || 'rgba(0,0,0,0.18)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;

        ctx.fillStyle = bubbleTint;
        roundRect(bx, by, bubbleW, bubbleH, r);
        ctx.fill();

        if (stackIndex === 0) {
            ctx.beginPath();
            ctx.moveTo(cx - 5, by + bubbleH);
            ctx.lineTo(cx + 5, by + bubbleH);
            ctx.lineTo(cx, by + bubbleH + tailH);
            ctx.closePath();
            ctx.fill();
        }

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = fontSize + 'px serif';
        ctx.fillText(t.emoji, cx, by + bubbleH / 2 + 1);

        ctx.restore();
    }
}

// Cached Conway wall tiles (pre-rasterized rounded cells) to avoid
// rebuilding vector paths for every wall cell every frame.
const wallTileCache = {
    wallHex: '',
    cellSize: 0,
    base: null,
    bright: null,
};

function makeScratchCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

function getWallTiles(wallHex) {
    if (wallTileCache.base &&
        wallTileCache.bright &&
        wallTileCache.wallHex === wallHex &&
        wallTileCache.cellSize === CELL_SIZE) {
        return wallTileCache;
    }

    const cell = CELL_SIZE;
    const inner = cell - 2;
    const rr = 3;

    const base = makeScratchCanvas(cell, cell);
    const bright = makeScratchCanvas(cell, cell);
    const bctx = base.getContext('2d');
    const hctx = bright.getContext('2d');

    bctx.clearRect(0, 0, cell, cell);
    hctx.clearRect(0, 0, cell, cell);
    bctx.fillStyle = wallHex;
    hctx.fillStyle = wallHex;

    // Draw the rounded body shape once into both variants.
    const drawBody = (targetCtx) => {
        const rx = 1, ry = 1, rw = inner, rh = inner;
        targetCtx.beginPath();
        targetCtx.moveTo(rx + rr, ry);
        targetCtx.lineTo(rx + rw - rr, ry);
        targetCtx.arcTo(rx + rw, ry, rx + rw, ry + rr, rr);
        targetCtx.lineTo(rx + rw, ry + rh - rr);
        targetCtx.arcTo(rx + rw, ry + rh, rx + rw - rr, ry + rh, rr);
        targetCtx.lineTo(rx + rr, ry + rh);
        targetCtx.arcTo(rx, ry + rh, rx, ry + rh - rr, rr);
        targetCtx.lineTo(rx, ry + rr);
        targetCtx.arcTo(rx, ry, rx + rr, ry, rr);
        targetCtx.closePath();
        targetCtx.fill();
    };
    drawBody(bctx);
    drawBody(hctx);

    // Bright variant bakes the top highlight so runtime only chooses a tile.
    hctx.fillStyle = 'rgba(255,255,255,0.106667)'; // 0.08 / 0.75
    hctx.fillRect(2, 2, cell - 8, 3);

    wallTileCache.wallHex = wallHex;
    wallTileCache.cellSize = CELL_SIZE;
    wallTileCache.base = base;
    wallTileCache.bright = bright;
    return wallTileCache;
}

function drawOverlay() {
    const W = canvas.width, H = canvas.height;
    const { status, restartCountdown } = state;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 0;

    if (status === 'paused') {
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.font = 'bold ' + Math.round(W * 0.04) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText('PAUSED', W / 2, H / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = Math.round(W * 0.016) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText('Click Pause to resume', W / 2, H / 2 + Math.round(W * 0.048));
    } else {
        const isComplete = status === 'complete';
        const title = isComplete ? 'COMPLETE' : 'GAME OVER';
        const color = isComplete ? '#a8d8bc' : '#e8a598';
        const fsize = Math.round(W * 0.045);
        const fsizeS = Math.round(W * 0.018);
        const gap = fsize * 1.3;

        ctx.fillStyle = color;
        ctx.font = 'bold ' + fsize + 'px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(title, W / 2, H / 2 - gap * 0.5);

        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = fsizeS + 'px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText('Restarting in ' + restartCountdown + 's', W / 2, H / 2 + gap * 0.5);
    }
}

function drawConwayLayer(layer, alpha) {
    if (!layer || alpha <= 0.001) return;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.drawImage(layer, 0, 0);
    ctx.globalAlpha = prevAlpha;
}

function buildConwayFadeLayers(cw, tiles, wallHex) {
    const shared = makeScratchCanvas(canvas.width, canvas.height);
    const fadeIn = makeScratchCanvas(canvas.width, canvas.height);
    const fadeInBright = makeScratchCanvas(canvas.width, canvas.height);
    const fadeOut = makeScratchCanvas(canvas.width, canvas.height);
    const fadeOutBright = makeScratchCanvas(canvas.width, canvas.height);
    const sharedCtx = shared.getContext('2d');
    const inCtx = fadeIn.getContext('2d');
    const inBrightCtx = fadeInBright.getContext('2d');
    const outCtx = fadeOut.getContext('2d');
    const outBrightCtx = fadeOutBright.getContext('2d');

    const cols = state.cols, rows = state.rows;
    const prev = cw.wallPrev;
    const next = cw.wallTarget;
    const cell = CELL_SIZE;

    for (let y = 0; y < rows; y++) {
        const rowBase = y * cols;
        for (let x = 0; x < cols; x++) {
            const idx = rowBase + x;
            const from = prev ? prev[idx] : 0;
            const to = next ? next[idx] : 0;
            if (!from && !to) continue;
            const px = x * cell, py = y * cell;
            if (from && to) {
                sharedCtx.drawImage(tiles.bright, px, py);
            } else if (!from && to) {
                inCtx.drawImage(tiles.base, px, py);
                inBrightCtx.drawImage(tiles.bright, px, py);
            } else {
                outCtx.drawImage(tiles.base, px, py);
                outBrightCtx.drawImage(tiles.bright, px, py);
            }
        }
    }

    return {
        shared,
        fadeIn,
        fadeInBright,
        fadeOut,
        fadeOutBright,
        cols,
        rows,
        cellSize: CELL_SIZE,
        wallHex,
        theme: state.theme,
        wallPrevRef: cw.wallPrev,
        wallTargetRef: cw.wallTarget,
    };
}

// Draw Conway walls using prebuilt layer canvases.
// This avoids per-cell draw work during each frame of the crossfade.
function drawConwayWalls() {
    const cw = state.conway;
    if (!cw.wallTarget) return;

    const isNight = state.theme === 'night';
    const wallHex = isNight ? state.colors.wallNight : state.colors.wall;
    const tiles = getWallTiles(wallHex);

    const fade = wallCache.fade;
    const needsRebuild = wallCache.dirty ||
        !fade ||
        fade.cols !== state.cols ||
        fade.rows !== state.rows ||
        fade.cellSize !== CELL_SIZE ||
        fade.theme !== state.theme ||
        fade.wallHex !== wallHex ||
        fade.wallPrevRef !== cw.wallPrev ||
        fade.wallTargetRef !== cw.wallTarget;
    if (needsRebuild) {
        wallCache.fade = buildConwayFadeLayers(cw, tiles, wallHex);
        wallCache.theme = state.theme;
        wallCache.dirty = false;
    }

    const active = wallCache.fade;
    const ease = conwayCurrentEase(cw);
    const transitioning = cw.fadeProgress < 1.0;
    const fadeOutAlpha = transitioning ? (1 - ease) * 0.75 : 0;
    const fadeInAlpha = transitioning ? ease * 0.75 : 0.75;
    const fadeOutLayer = (1 - ease) > 0.85 ? active.fadeOutBright : active.fadeOut;
    const fadeInLayer = (!transitioning || ease > 0.85) ? active.fadeInBright : active.fadeIn;

    if (isNight) {
        ctx.shadowColor = 'rgba(120,100,200,0.4)';
        ctx.shadowBlur = 4;
    }

    drawConwayLayer(active.shared, 0.75);
    drawConwayLayer(fadeOutLayer, fadeOutAlpha);
    drawConwayLayer(fadeInLayer, fadeInAlpha);

    if (isNight) {
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
    }
}

// Update the Conway regen countdown ring embedded in the settings gear SVG.
// Uses stroke-dashoffset on a pre-placed SVG circle (no canvas drawing needed).
const _regenRing = document.getElementById('conwayRegenRing');
const _regenRingBg = document.getElementById('conwayRegenRingBg');
const _REGEN_CIRC = 2 * Math.PI * 11; // circumference for r=11 â‰ˆ 69.115

function updateConwayRegenRing(nowMs) {
    const enabled = state.conway.enabled;
    const vis = enabled ? 'visible' : 'hidden';
    if (_regenRing) _regenRing.setAttribute('visibility', vis);
    if (_regenRingBg) _regenRingBg.setAttribute('visibility', vis);
    if (!enabled || !_regenRing) return;

    const cw = state.conway;
    const elapsed = nowMs - (cw.nextRegenMs - cw.regenMs);
    const progress = Math.min(1, Math.max(0, elapsed / cw.regenMs));
    // dashoffset = circumference * (1 - progress): 0 = full ring, circ = empty ring
    _regenRing.setAttribute('stroke-dashoffset', (_REGEN_CIRC * (1 - progress)).toFixed(2));
}

// Draw a single snake (body + head + food) using its own per-snake colors.
// Respawning snakes render as fading corpses until their respawn time.
function drawSnake(sn, nowMs) {
    const body = sn.body;
    if (!body || body.length === 0) return;
    const isCorpse = sn.respawning;
    let corpseAlpha = 1;
    if (isCorpse) {
        const fadeStartMs = sn.corpseFadeStartMs || (sn.respawnAt - SNAKE_CORPSE_FADE_MS);
        const fadeProgress = Math.min(1, Math.max(0, (nowMs - fadeStartMs) / SNAKE_CORPSE_FADE_MS));
        corpseAlpha = 1 - fadeProgress;
        if (corpseAlpha <= 0) return;
    }

    const prevBody = sn.prevBody || body;
    const personalitySpeed = PERSONALITY_META[sn.personality]?.speedMult ?? 1.0;
    const chaseBoost = (sn._behaviorState === 'killing' || sn._behaviorState === 'feared') ? CHASE_SPEED_MULT : 1.0;
    const effectiveTickMs = sn.wandering ? state.tickMs * WANDER_SPEED_DIVISOR : state.tickMs * personalitySpeed * chaseBoost;
    const moveProgress = effectiveTickMs > 0
        ? Math.min(1, Math.max(0, (nowMs - (sn.lastMoveMs || nowMs)) / effectiveTickMs))
        : 1;
    const t = state.smoothMovement ? moveProgress : 1;
    const segPos = (i) => {
        const cur = body[i];
        const prev = prevBody[i] || prevBody[Math.max(0, prevBody.length - 1)] || cur;
        return {
            x: prev.x + (cur.x - prev.x) * t,
            y: prev.y + (cur.y - prev.y) * t,
        };
    };

    ctx.save();
    if (isCorpse) ctx.globalAlpha = corpseAlpha;

    // Food (drawn under the snake so it shows behind the head if they overlap)
    if (!isCorpse && sn.food) {
        const pulse = 1 + 0.08 * Math.sin(nowMs / 300);
        const fr = (CELL_SIZE / 2 - 2) * pulse;
        const { px, py } = toPixel(sn.food.x, sn.food.y);
        ctx.fillStyle = sn.colorHead;
        ctx.shadowColor = sn.colorHead;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, fr, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Body (tail -> neck, back to front)
    for (let i = body.length - 1; i >= 1; i--) {
        const p = segPos(i);
        const px = p.x * CELL_SIZE;
        const py = p.y * CELL_SIZE;
        const alpha = 0.55 + 0.45 * (1 - i / body.length);
        ctx.fillStyle = hexToRgba(sn.colorBody, alpha);
        roundRect(px + 1.5, py + 1.5, CELL_SIZE - 3, CELL_SIZE - 3, 4);
        ctx.fill();
    }

    // Head
    const headPos = segPos(0);
    const px = headPos.x * CELL_SIZE;
    const py = headPos.y * CELL_SIZE;
    ctx.fillStyle = sn.colorHead;
    ctx.shadowColor = sn.colorHead;
    ctx.shadowBlur = 4;
    roundRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2, 5);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (!isCorpse && CELL_SIZE >= 14) drawEyes(headPos, sn.nextDir);
    ctx.restore();
}

function render(nowMs) {
    const W = canvas.width, H = canvas.height;
    const { cols, rows, status, theme, colors } = state;

    // Board background
    const boardColor = theme === 'night' ? colors.boardNight : colors.board;
    ctx.fillStyle = boardColor;
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    const gridColor = theme === 'night' ? colors.gridLineNight : colors.gridLine;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) {
        ctx.moveTo(c * CELL_SIZE, 0);
        ctx.lineTo(c * CELL_SIZE, H);
    }
    for (let r = 0; r <= rows; r++) {
        ctx.moveTo(0, r * CELL_SIZE);
        ctx.lineTo(W, r * CELL_SIZE);
    }
    ctx.stroke();

    // Conway walls (below food and snakes)
    if (state.conway.enabled) drawConwayWalls();

    // Draw all snakes (food + body + head), then all thought bubbles on top.
    for (const sn of state.snakes) {
        drawSnake(sn, nowMs);
    }
    for (const sn of state.snakes) {
        drawThoughts(sn, nowMs);
    }

    // Conway regen ring (SVG overlay on settings button)
    if (nowMs !== undefined) updateConwayRegenRing(nowMs);

    // Status overlays (paused / game over / complete)
    if (status !== 'running') drawOverlay();
}

