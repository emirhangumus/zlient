# Contributing to zlient

Thank you for your interest in contributing to **zlient**! This document provides guidelines for setting up your environment and contributing effectively.

## Prerequisites

- [Bun](https://bun.sh) (v1.0.0 or higher)
- [Node.js](https://nodejs.org) (v18 or higher)

## Getting Started

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/zlient.git
   cd zlient
   ```

2. **Install Dependencies**
   We use `bun` for dependency management.
   ```bash
   bun install
   ```

## Development Workflow

### Building
The project uses [Rolldown](https://rolldown.rs/) for fast bundling.
```bash
bun run build
# Watch mode
bun run dev
```

### Testing
We use Bun's built-in test runner.
```bash
bun test
```

### Linting & Formatting
Ensure your code is clean and consistent.
```bash
bun run lint
bun run format
```

### Documentation
Documentation is built with [VitePress](https://vitepress.dev).
```bash
bun run docs:dev
```

## Project Structure

- `lib/` - Source code (published package)
- `docs/` - Documentation source
- `test/` - Unit and integration tests
- `dist/` - Build output (generated)

## Pull Request Guidelines

1. **Create a Branch**: Use a descriptive name (e.g., `feat/retry-strategy`).
2. **Commit Messages**: We follow [Conventional Commits](https://www.conventionalcommits.org/).
   - `feat:` New features
   - `fix:` Bug fixes
   - `docs:` Documentation changes
   - `chore:` Maintenance tasks
3. **Tests**: Ensure all tests pass and add new tests for your changes.
4. **Docs**: Update documentation if you modify public APIs.

## Code Style

- **TypeScript**: Use strict types. Avoid `any`.
- **Zod**: Use Zod schemas for runtime validation where appropriate.
- **Async/Await**: Prefer `async/await` over raw promises.

## Release Process

(Maintainers only)

1. Update version in `package.json`
2. Run build: `bun run build`
3. Publish: `npm publish` (or `bun publish`)
4. push tags

## Code of Conduct

Please be respectful and constructive in all interactions.

Happy coding!
