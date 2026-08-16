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

### Android

The `android` directory contains an installable Android live-wallpaper app. It
uses the same HTML, CSS, JavaScript, snake behavior, and procedural walls as the
browser version. The APK contains the web files and does not need a network
connection.

The Android app provides:

- A settings activity with the full Snek settings panel and a live preview.
- A `WallpaperService` for the home screen and supported lock screens.
- A `DreamService` for Android's charging screen saver.
- Shared settings that update the wallpaper and screen saver.
- Lifecycle controls that pause Snek when its surface is not visible.
- A 30 fps Android render limit to reduce battery use and heat.

To build a debug APK:

1. Install Android Studio with JDK 17 and the stable Android SDK (API 36).
2. Open the `android` directory as an Android Studio project.
3. Build the `app` debug variant, or run `gradlew.bat assembleDebug` from that directory.
4. Install `android/app/build/outputs/apk/debug/app-debug.apk` on the phone.

Open **Snek Wallpaper** on the phone to change settings or to open Android's
live-wallpaper and screen-saver selectors. The phone maker decides if one live
wallpaper can be used on the home screen, lock screen, or both.

## License

This project is dual-licensed:

- ✅ Free for personal, educational, and hobbyist (non-commercial) use  
- 💼 Commercial use requires a separate paid license

See the LICENSE file for details.

