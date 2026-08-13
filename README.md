See it live here: [Github Pages](https://defamationstation.github.io/wallpaper-game-snek/)

# wallpaper-game-snek

An algo-driven Snake game designed to run as an animated live wallpaper via [Lively Wallpaper](https://github.com/rocksdanister/lively).
<img width="3265" height="1376" alt="image" src="https://github.com/user-attachments/assets/d32e5638-f1e2-464a-b987-92e9cd52e54f" />

## Features

- **Multiple snakes** — up to 10 AI-controlled snakes roam the board simultaneously, each with its own food target and color.
- **Procedural walls** — optionally fill the board with maze-like structures that regenerate on a configurable interval and force snakes to find new paths.
- **Satiety & wander mode** — after eating 10 pellets a snake enters a relaxed wander mode, slowly shedding tail segments before getting hungry again.
- **Emoji thought bubbles** — snakes express their mood (eating 😋, full 😌, scared 😰, greeting 👋, death 💥).
- **Day / Night themes** — toggle a dark palette at any time.
- **Fully customisable colors** — snake, board background, and wall color are each independently configurable.
- **Adjustable speed** — 1–60 ticks per second.

## Usage

### Standalone (browser)

Open `index.html` in any modern browser. A settings gear (⚙) in the corner opens the in-page control panel.

### Lively Wallpaper

1. Add `index.html` as a new wallpaper source in [Lively Wallpaper](https://github.com/rocksdanister/lively).
2. Use the bundled `LivelyProperties.json` to expose all settings in Lively's property panel (speed, colors, procedural walls, etc.).

## License

This project is dual-licensed:

- ✅ Free for personal, educational, and hobbyist (non-commercial) use  
- 💼 Commercial use requires a separate paid license

See the LICENSE file for details.

