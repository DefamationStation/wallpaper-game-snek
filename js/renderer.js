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
    if (!sn.thoughts.length || sn.respawning || !sn.body.length) return;

    const active = [];
    for (const t of sn.thoughts) {
        const age = nowMs - t.born;
        if (age >= t.lifetime) continue; // expired — drop it
        active.push(t);

        const progress = age / t.lifetime;           // 0 → 1
        const fadeStart = 0.75;
        let alpha = 1;
        // Pop-in scale at the very start (first 8%)
        let scale = 1;
        if (progress < 0.08) {
            scale = progress / 0.08;
        }
        if (progress > fadeStart) {
            alpha = 1 - (progress - fadeStart) / (1 - fadeStart);
        }

        // Always follow the live head position.
        const head = sn.body[0];
        const { px, py } = toPixel(head.x, head.y);
        const cx = px + CELL_SIZE / 2;
        const cy = py;

        const fontSize = Math.round(CELL_SIZE * 1.15);
        const pad = 5;
        const bubbleW = fontSize + pad * 2;
        const bubbleH = fontSize + pad * 1.6;
        const tailH = 6;           // small triangle tail pointing down toward head
        const r = 8;               // corner radius
        const bx = cx - bubbleW / 2;
        const by = cy - bubbleH - tailH - CELL_SIZE * 0.2; // above head

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx, by + bubbleH / 2);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -(by + bubbleH / 2));

        // Cloud shadow
        ctx.shadowColor = 'rgba(0,0,0,0.18)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;

        // Bubble fill
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        roundRect(bx, by, bubbleW, bubbleH, r);
        ctx.fill();

        // Tail triangle (small downward-pointing arrow)
        ctx.beginPath();
        ctx.moveTo(cx - 5, by + bubbleH);
        ctx.lineTo(cx + 5, by + bubbleH);
        ctx.lineTo(cx, by + bubbleH + tailH);
        ctx.closePath();
        ctx.fill();

        // Reset shadow before drawing emoji
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Emoji
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = fontSize + 'px serif';
        ctx.fillText(t.emoji, cx, by + bubbleH / 2 + 1);

        ctx.restore();
    }

    sn.thoughts = active;
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

// Draw Conway walls with per-cell alpha.
// When the crossfade is complete the result is cached in an OffscreenCanvas
// so subsequent frames just blit rather than iterate every cell.
function drawConwayWalls(boardHex) {
    const cw = state.conway;
    if (!cw.wallAlpha) return;

    const isNight = state.theme === 'night';
    const wallHex = isNight ? state.colors.wallNight : state.colors.wall;
    const wallR = parseInt(wallHex.slice(1, 3), 16);
    const wallG = parseInt(wallHex.slice(3, 5), 16);
    const wallB = parseInt(wallHex.slice(5, 7), 16);

    // If stable (crossfade done) and cache valid, just blit.
    if (cw.fadeProgress >= 1.0 && !wallCache.dirty && wallCache.theme === state.theme) {
        ctx.drawImage(wallCache.oc, 0, 0);
        return;
    }

    // During crossfade draw directly to the main canvas.
    // When stable, draw to the offscreen canvas and cache it.
    let target = ctx;
    if (cw.fadeProgress >= 1.0 && typeof OffscreenCanvas !== 'undefined') {
        if (!wallCache.oc || wallCache.oc.width !== canvas.width || wallCache.oc.height !== canvas.height) {
            wallCache.oc = new OffscreenCanvas(canvas.width, canvas.height);
        }
        target = wallCache.oc.getContext('2d');
        target.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (isNight) {
        target.shadowColor = 'rgba(120,100,200,0.4)';
        target.shadowBlur = 4;
    }

    const cols = state.cols, rows = state.rows;
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const a = cw.wallAlpha[y * cols + x];
            if (a < 0.01) continue;
            const px = x * CELL_SIZE, py = y * CELL_SIZE;
            target.fillStyle = 'rgba(' + wallR + ',' + wallG + ',' + wallB + ',' + (a * 0.75) + ')';
            // Inline rounded rect for performance (avoids function call overhead per cell).
            const rx = px + 1, ry = py + 1, rw = CELL_SIZE - 2, rh = CELL_SIZE - 2, rr = 3;
            target.beginPath();
            target.moveTo(rx + rr, ry);
            target.lineTo(rx + rw - rr, ry);
            target.arcTo(rx + rw, ry, rx + rw, ry + rr, rr);
            target.lineTo(rx + rw, ry + rh - rr);
            target.arcTo(rx + rw, ry + rh, rx + rw - rr, ry + rh, rr);
            target.lineTo(rx + rr, ry + rh);
            target.arcTo(rx, ry + rh, rx, ry + rh - rr, rr);
            target.lineTo(rx, ry + rr);
            target.arcTo(rx, ry, rx + rr, ry, rr);
            target.closePath();
            target.fill();

            if (a > 0.85) {
                target.fillStyle = 'rgba(255,255,255,' + (a * 0.08) + ')';
                target.fillRect(px + 2, py + 2, CELL_SIZE - 8, 3);
            }
        }
    }

    if (isNight) target.shadowBlur = 0;

    if (cw.fadeProgress >= 1.0 && wallCache.oc) {
        wallCache.dirty = false;
        wallCache.theme = state.theme;
        ctx.drawImage(wallCache.oc, 0, 0);
    } else {
        wallCache.dirty = true;
    }
}

// Update the Conway regen countdown ring embedded in the settings gear SVG.
// Uses stroke-dashoffset on a pre-placed SVG circle (no canvas drawing needed).
const _regenRing = document.getElementById('conwayRegenRing');
const _regenRingBg = document.getElementById('conwayRegenRingBg');
const _REGEN_CIRC = 2 * Math.PI * 11; // circumference for r=11 ≈ 69.115

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
// Called once per entry in state.snakes. Skipped for respawning (dead) snakes.
function drawSnake(sn, nowMs) {
    if (sn.respawning) return;
    const body = sn.body;
    if (!body || body.length === 0) return;

    // Food (drawn under the snake so it shows behind the head if they overlap)
    if (sn.food) {
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

    // Body (tail → neck, back to front)
    for (let i = body.length - 1; i >= 1; i--) {
        const { px, py } = toPixel(body[i].x, body[i].y);
        const alpha = 0.55 + 0.45 * (1 - i / body.length);
        ctx.fillStyle = hexToRgba(sn.colorBody, alpha);
        roundRect(px + 1.5, py + 1.5, CELL_SIZE - 3, CELL_SIZE - 3, 4);
        ctx.fill();
    }

    // Head
    const { px, py } = toPixel(body[0].x, body[0].y);
    ctx.fillStyle = sn.colorHead;
    ctx.shadowColor = sn.colorHead;
    ctx.shadowBlur = 4;
    roundRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2, 5);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (CELL_SIZE >= 14) drawEyes(body[0], sn.nextDir);
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
    if (state.conway.enabled) drawConwayWalls(boardColor);

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
