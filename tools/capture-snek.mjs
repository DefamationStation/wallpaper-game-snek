import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const PORT = 8765;

const intermediateFile = path.join(projectRoot, 'snek_raw.mkv');
const outputGif1080 = path.join(projectRoot, 'snek_60fps_1080p.gif');
const outputGif720 = path.join(projectRoot, 'snek_720p_smooth.gif');
const outputMp4 = path.join(projectRoot, 'snek_60fps_1080p.mp4');
const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-snek-'));

// Spawn ffmpeg to collect mjpeg frames from pipe into mkv
const ffmpegIn = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-r', '60',
    '-i', '-',
    '-c:v', 'copy',
    intermediateFile
], { stdio: ['pipe', 'inherit', 'inherit'] });

let frameCount = 0;
const TOTAL_FRAMES = 600;

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/log' && req.method === 'POST') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            console.log(`[browser log] ${Buffer.concat(chunks).toString('utf-8')}`);
            res.writeHead(200);
            res.end();
        });
        return;
    }

    if (pathname === '/frame' && req.method === 'POST') {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            const buf = Buffer.concat(chunks);
            ffmpegIn.stdin.write(buf);
            frameCount++;
            if (frameCount % 60 === 0) {
                console.log(`[snek] Captured frame ${frameCount}/${TOTAL_FRAMES}`);
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('ok');
        });
        return;
    }

    if (pathname === '/done' && req.method === 'POST') {
        console.log(`[snek] Frame capture completed (${frameCount} frames). Finalizing stream...`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        ffmpegIn.stdin.end();
        return;
    }

    if (pathname === '/' || pathname === '/index.html' || pathname === '/capture.html') {
        const indexPath = path.join(projectRoot, 'index.html');
        let html = fs.readFileSync(indexPath, 'utf-8');

        // Inject capture controller script right before </body>
        const injection = `
<style>
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    width: 1920px !important;
    height: 1080px !important;
  }
  #gameCanvas {
    width: 1920px !important;
    height: 1080px !important;
    display: block !important;
  }
  #settingsBtn, #settingsPanel {
    display: none !important;
  }
</style>
<script>
window.onerror = function(msg, url, lineNo, colNo, err) {
    fetch('/log', { method: 'POST', body: JSON.stringify({ msg, url, lineNo, stack: err ? err.stack : '' }) });
};

window.addEventListener('load', async () => {
    fetch('/log', { method: 'POST', body: "Page loaded in headless Edge" });

    // Stop the default requestAnimationFrame loop
    if (typeof loopId !== 'undefined' && loopId !== null) {
        cancelAnimationFrame(loopId);
        loopId = null;
    }
    window.requestAnimationFrame = () => {};

    // Permanently fix canvas dimensions to true 1080p
    window.resizeCanvas = function() {
        canvasLogicalWidth = 1920;
        canvasLogicalHeight = 1080;
        canvasRenderScale = 1;
        canvas.width = 1920;
        canvas.height = 1080;
        canvas.style.width = '1920px';
        canvas.style.height = '1080px';
        if (typeof ctx.setTransform === 'function') {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        state.cols = Math.max(1, Math.floor(1920 / CELL_SIZE));
        state.rows = Math.max(1, Math.floor(1080 / CELL_SIZE));
        wallCache.dirty = true;
        wallCache.fade = null;
    };
    window.resizeCanvas();
    if (typeof initGame === 'function') initGame();

    // Set speed to NORMAL DEFAULT 4 TPS with smooth vector glide
    state.tickMs = tpsToMs(4);
    state.smoothMovement = true;

    // Add 2 extra snakes for lively multi-snake interactions
    if (typeof addSnake === 'function') {
        try { addSnake(); } catch (e) {}
        try { addSnake(); } catch (e) {}
    }

    let currentTs = 1000;
    performance.now = () => currentTs;

    for (const sn of state.snakes) {
        sn.lastTickMs = currentTs;
        sn.lastMoveMs = currentTs;
    }

    // Warm up the simulation for 120 frames (2 seconds) so snakes are in full motion
    const dt = 1000 / 60;
    for (let w = 0; w < 120; w++) {
        currentTs += dt;
        gameLoop(currentTs);
    }

    fetch('/log', { method: 'POST', body: "Warmup complete. Starting frame capture at normal 1x speed..." });
    const TOTAL_FRAMES = 600;

    for (let f = 0; f < TOTAL_FRAMES; f++) {
        currentTs += dt;
        gameLoop(currentTs);

        const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.95);
        });

        await fetch('/frame', {
            method: 'POST',
            body: blob
        });
    }

    fetch('/log', { method: 'POST', body: "All frames sent to server." });
    await fetch('/done', { method: 'POST' });
});
</script>
`;
        html = html.replace('</body>', `${injection}</body>`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
    }

    // Serve static assets
    let filePath = path.join(projectRoot, pathname.replace(/^\//, ''));
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('Not Found');
        return;
    }

    const ext = path.extname(filePath);
    const mimeTypes = {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, async () => {
    console.log(`Server listening on http://localhost:${PORT}`);

    const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    console.log(`Launching Edge in headless mode...`);

    const edgeProc = spawn(edgePath, [
        '--headless=new',
        '--no-sandbox',
        '--mute-audio',
        '--force-device-scale-factor=1',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        `--user-data-dir=${tempUserDataDir}`,
        '--window-size=1920,1080',
        '--hide-scrollbars',
        `http://localhost:${PORT}/capture.html`
    ], { stdio: 'ignore' });

    ffmpegIn.on('close', (code) => {
        console.log(`ffmpeg intermediate stream closed with code ${code}`);
        edgeProc.kill();
        server.close();
        try { fs.rmSync(tempUserDataDir, { recursive: true, force: true }); } catch (e) {}

        console.log(`Encoding formats...`);

        // 1. MP4 1080p 60fps
        const mp4 = spawn('ffmpeg', [
            '-y', '-i', intermediateFile,
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '60', '-preset', 'fast', '-crf', '18',
            outputMp4
        ], { stdio: 'inherit' });

        mp4.on('close', () => {
            // 2. 1080p GIF at 50fps
            const gif1080 = spawn('ffmpeg', [
                '-y', '-i', intermediateFile,
                '-vf', 'fps=50,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=none:diff_mode=rectangle',
                outputGif1080
            ], { stdio: 'inherit' });

            gif1080.on('close', () => {
                // 3. 720p GIF at 50fps (super lightweight & fast decoding for any image viewer)
                const gif720 = spawn('ffmpeg', [
                    '-y', '-i', intermediateFile,
                    '-vf', 'fps=50,scale=1280:720:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=none:diff_mode=rectangle',
                    outputGif720
                ], { stdio: 'inherit' });

                gif720.on('close', () => {
                    console.log(`All snek outputs generated successfully!`);
                    try { fs.unlinkSync(intermediateFile); } catch (e) {}
                    process.exit(0);
                });
            });
        });
    });
});
