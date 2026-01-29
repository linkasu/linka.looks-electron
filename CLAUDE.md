# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LINKa. Looks ("LINKa. смотри") — an Electron desktop app for eye-gaze assisted communication. Users interact with card sets (.linka files) via Tobii eye tracker, keyboard, mouse, or joystick. Built with Vue 3 + TypeScript + Vuetify 3.

## Commands

```bash
yarn install            # Install dependencies
yarn electron:serve     # Dev server with hot reload
yarn electron:build     # Production build + installer
yarn test:unit          # Run unit tests (Mocha + Chai)
yarn lint               # ESLint check
yarn lint-fix           # ESLint auto-fix
```

## Architecture

### Process Model (Electron)

- **Main process** (`src/electron/main.ts`): File I/O, auto-updates, eye tracker integration, IPC handlers
- **Renderer process** (`src/frontend/main.ts`): Vue 3 app with Vuetify UI
- **Shared** (`src/common/`): Interfaces and constants used by both processes

### IPC Communication

Backend methods are defined in `ICloudStorage` interface (`src/common/abstract.ts`). Main process registers them as `ipcMain.handle("storage:<method>")`, renderer calls via `ipcRenderer.invoke("storage:<method>")`. The frontend `StorageService` (`src/frontend/services/card-storage-service.ts`) wraps all IPC calls. The backend `CardsStorage` (`src/electron/services/card-storage-service.ts`) implements actual file operations.

### State Management

Vuex 4 store in `src/frontend/store/index.ts`. Key state sections: button/input settings, editor state, UI config, voice/TTS, key mappings. Selected fields persist via `electron-store`.

### Eye Tracker

Tobii integration via `eyelog` package (Windows only). `BackWatch` (`src/electron/tobii/backWatch.ts`) processes gaze coordinates in main process, `PageWatch` (`src/electron/tobii/pageWatch.ts`) collects target elements in renderer. Communication is one-way IPC: renderer sends element positions, main process sends back click/enter/exit events.

### Routes

| Path | View | Purpose |
|------|------|---------|
| `/` | HomeView | Directory browser for .linka files |
| `/set/:path` | SetExplorerView | Display/interact with a card set |
| `/edit/:path` | EditorView | Edit cards in a set |
| `/settings` | SettingsView | App settings |
| `/calibration` | CalibrationView | Eye tracker calibration |

### .linka File Format

ZIP archive containing `config.json` (grid layout, card definitions, quiz settings) plus image/audio assets. See `docs/linka-format-en.md` for full spec. Card types: Audio (0), Space (1), Empty (2), New (3).

### TTS

Remote API at `tts.linka.su` via `src/frontend/utils/TTSServer.ts`. Audio playback handled by `src/frontend/utils/TTS.ts`.

## Code Style

- Double quotes, semicolons required, no trailing commas
- ESLint with `@electron-internal` + `@typescript-eslint/recommended` + `plugin:vue/base`
- `camelcase` rule is off
- Node 16.17.0 (see `.nvmrc`)

## Build & Deployment

- Vue CLI 5 + `vue-cli-plugin-electron-builder` for build pipeline
- `electron-builder` produces NSIS installer for Windows
- Auto-updates via `electron-updater` from GitHub releases
- `postinstall` script copies eyelog binaries to `extraResources/bin/`
- GitHub Actions: `electron.yml` (build/release on push to main), `pr-test.yaml` (PR validation)
