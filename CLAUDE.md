# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Manager

Use **Bun** exclusively — not npm or yarn.

## Commands

| Task | Command |
|------|---------|
| Build | `bun run build` |
| Test | `bun test` |
| Lint | `bun run lint` |
| Format | `bun run format` |
| Type-check | `bun run typecheck` |
| Docs (dev) | `bun run docs:dev` |

- `bun run build` runs rolldown bundling + `tsc` for declarations; `prebuild` auto-cleans `dist/` first.
- Lint only targets `lib/**/*.ts` — test files are not linted.
- Tests are fully offline (all network calls are mocked via `mockFetch`); no env vars or running server required.

## Repository Layout

- `lib/` — published source code (the only thing that goes into `dist/`)
- `test/` — test suite using `bun:test`
- `docs/` — VitePress documentation site
- `dist/` — build output (generated, do not edit)

## Core Constraint: Zero Runtime Dependencies

The package ships with **zero production dependencies**. Do not add any `dependencies` to `package.json`. Validation libraries (Zod, Valibot, ArkType) belong in `devDependencies` only and are used solely for testing. The Standard Schema spec is duck-typed — no import required.

Rolldown marks `zod` as external (it appears in rolldown config) because zod is test-only and must never be bundled.

## Code Style

Prettier config: `singleQuote: true`, `semi: true`, `trailingComma: 'es5'`, `printWidth: 100`, `tabWidth: 2`.

ESLint: `@typescript-eslint/no-unused-vars` is an error; prefix intentionally unused arguments with `_` to satisfy it.

## Git Conventions

- **Branches:** `feat/<name>`, `fix/<name>`, `refactor/<name>` (mirrors conventional commit types)
- **Commits:** Conventional Commits — `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

## TypeScript

Strict mode is enabled (`strict`, `noUnusedLocals`, `noUnusedParameters`). Prefer `type` aliases over `interface` when there is no intent to extend. Target is ES2017; do not use syntax that requires a higher target.
