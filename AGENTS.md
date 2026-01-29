# Repository Guidelines

## Project Structure & Module Organization
- `src/frontend/` contains the Vue 3 renderer app (views, components, store, router, services).
- `src/electron/` hosts the Electron main-process code and app lifecycle wiring.
- `src/common/` is shared logic used by both renderer and main process.
- `src/frontend/tests/unit/` holds unit tests (Mocha + Chai). Example: `TTSServer.spec.ts`.
- `public/` provides static assets bundled into the renderer build.
- `extraResources/` and `build/` contain Electron packaging assets and installer resources.
- `docs/` and `agents/` store project documentation and agent guidance.

## Build, Test, and Development Commands
Use Yarn (repo is locked to Yarn 1.x) and Node 16.x.
- `yarn install` — install dependencies (runs `postinstall` to set up Electron native deps).
- `yarn electron:serve` — run the Electron app in dev mode with hot reload.
- `yarn electron:build` — build the production Electron installer.
- `yarn serve` — run the Vue renderer only (useful for UI-only debugging).
- `yarn test:unit` — run unit tests.
- `yarn lint` / `yarn lint-fix` — check or auto-fix ESLint issues in `src/`.

## Coding Style & Naming Conventions
- Primary languages: TypeScript + Vue single-file components.
- ESLint is authoritative (`.eslintrc.js`); follow its rules in existing files.
- Style expectations from the config: double quotes, semicolons, no trailing commas.
- Keep module and component names descriptive and aligned with existing patterns (e.g., `TTSServer`, `App.vue`).

## Testing Guidelines
- Frameworks: Mocha + Chai via `@vue/cli-plugin-unit-mocha`.
- Place unit tests under `src/frontend/tests/unit/` and name them `*.spec.ts`.
- Run tests locally with `yarn test:unit` before opening a PR.

## Commit & Pull Request Guidelines
- Commit messages follow a conventional style seen in history: `type: short summary` (e.g., `docs: add CLAUDE.md`).
- Keep subjects imperative, short, and lowercase.
- PRs should include: a clear description, linked issue(s) when applicable, and screenshots for UI changes.

## Configuration Tips
- Node version is pinned in `.nvmrc` (`v16.20.0`); keep tooling aligned with `package.json` engines.
- Electron build resources live in `build/` and `extraResources/`; update these when changing installers.
