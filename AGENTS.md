# Repository Guidelines

## Project Structure & Module Organization

- `src/frontend/` contains the Vue 3 renderer app (views, components, store, router, services).
- `src/electron/` hosts the Electron main-process code and app lifecycle wiring.
- `src/common/` is shared logic used by both renderer and main process.
- `src/frontend/tests/unit/` holds unit tests (Vitest + Chai assertions). Example: `TTSServer.spec.ts`.
- `public/` provides static assets bundled into the renderer build.
- `extraResources/` and `build/` contain Electron packaging assets and installer resources.
- `docs/` and `agents/` store project documentation and agent guidance.

## Build, Test, and Development Commands

Use npm and Node 22.x for the current baseline.

- `npm ci` — install dependencies (runs `postinstall` to set up Electron native deps).
- `npm run electron:serve` — run the Electron app in dev mode with hot reload.
- `npm run electron:build` — build the production Electron installer.
- `npm run serve` — run the Vue renderer only (useful for UI-only debugging).
- `npm run test:unit` — run unit tests.
- `npm run typecheck` — run TypeScript no-emit checks.
- `npm run lint` / `npm run lint-fix` — check or auto-fix ESLint issues in `src/`.

## Coding Style & Naming Conventions

- Primary languages: TypeScript + Vue single-file components.
- ESLint is authoritative (`.eslintrc.js`); follow its rules in existing files.
- Style expectations from the config: double quotes, semicolons, no trailing commas.
- Keep module and component names descriptive and aligned with existing patterns (e.g., `TTSServer`, `App.vue`).

## Testing Guidelines

- Frameworks: Vitest + Chai assertions.
- Place unit tests under `src/frontend/tests/unit/` and name them `*.spec.ts`.
- Run tests locally with `npm run test:unit` before opening a PR.

## Commit & Pull Request Guidelines

- Commit messages follow a conventional style seen in history: `type: short summary` (e.g., `docs: add CLAUDE.md`).
- Keep subjects imperative, short, and lowercase.
- PRs should include: a clear description, linked issue(s) when applicable, and screenshots for UI changes.

## Configuration Tips

- Node version is pinned in `.nvmrc` (`v22.22.2`); keep tooling aligned with `package.json` engines.
- Electron build resources live in `build/` and `extraResources/`; update these when changing installers.
