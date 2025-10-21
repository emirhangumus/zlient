# Contributing to zlient

Thank you for your interest in contributing to zlient! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js >= 16.0.0
- npm or bun

### Getting Started

1. **Fork and clone the repository**

```bash
git clone https://github.com/emirhangumus/zlient.git
cd zlient
```

2. **Install dependencies**

```bash
npm install
# or
bun install
```

3. **Build the package**

```bash
npm run build
```

4. **Run linting**

```bash
npm run lint
```

## Project Structure

```
lib/        - Source code (what gets published)
examples/   - Usage examples (not published)
dist/       - Build output (generated)
```

See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for detailed documentation.

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes

- Write clean, typed TypeScript code
- Follow the existing code style
- Add JSDoc comments for public APIs
- Update examples if needed

### 3. Run Quality Checks

```bash
# Lint your code
npm run lint

# Format your code
npm run format

# Check types
npm run typecheck

# Build to ensure it works
npm run build
```

### 4. Test Your Changes

```bash
# Build the package
npm run build

# Test exports
node test-package.mjs

# Test with examples (if applicable)
node examples/basic-usage.ts
```

### 5. Commit Your Changes

Use conventional commit messages:

```bash
git commit -m "feat: add new authentication provider"
git commit -m "fix: resolve race condition in retry logic"
git commit -m "docs: improve README examples"
git commit -m "chore: update dependencies"
```

**Commit Types:**
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `test:` - Test additions or changes
- `chore:` - Build process or tooling changes

### 6. Submit a Pull Request

- Push your branch to GitHub
- Create a Pull Request with a clear description
- Link any related issues
- Wait for review and address feedback

## Code Style Guidelines

### TypeScript

- Use strict TypeScript
- Avoid `any` types
- Prefer interfaces for public APIs
- Use type inference where appropriate
- Export types alongside implementations

Example:
```typescript
// ✅ Good
export interface CustomAuthOptions {
  header: string;
  getValue: () => Promise<string>;
}

export class CustomAuth implements AuthProvider {
  constructor(private options: CustomAuthOptions) {}
  // ...
}

// ❌ Bad
export class CustomAuth {
  constructor(private options: any) {} // Using 'any'
  // ...
}
```

### Naming Conventions

- **Classes**: PascalCase (`HttpClient`, `BaseEndpoint`)
- **Interfaces**: PascalCase (`AuthProvider`, `ClientOptions`)
- **Functions**: camelCase (`safeParse`, `parseOrThrow`)
- **Constants**: SCREAMING_SNAKE_CASE (`HTTP_METHOD`)
- **Files**: kebab-case or PascalCase for classes

### Documentation

Add JSDoc comments for public APIs:

```typescript
/**
 * Validates data against a Zod schema and returns a safe parse result.
 * 
 * @template T - The expected type after validation
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @returns A result object with success flag and data or error
 * 
 * @example
 * ```typescript
 * const result = safeParse(UserSchema, data);
 * if (result.success) {
 *   console.log(result.data);
 * }
 * ```
 */
export function safeParse<T>(schema: z.ZodTypeAny, data: unknown): SafeParseResult<T> {
  // ...
}
```

### Error Handling

- Use custom error classes (`ApiError`)
- Provide meaningful error messages
- Include context in errors

```typescript
throw new ApiError('Request failed', {
  status: response.status,
  details: errorData,
});
```

## Adding New Features

### Authentication Providers

1. Create a new class implementing `AuthProvider`
2. Add to `lib/auth.ts`
3. Export from `lib/index.ts`
4. Add example in `examples/`
5. Update README

### Interceptors

1. Define the interceptor type
2. Add to `ClientOptions`
3. Implement in `HttpClient`
4. Add example
5. Update documentation

### Schemas

1. Add to `lib/schemas/common.ts`
2. Export from `lib/index.ts`
3. Provide usage examples
4. Update README

## Testing Guidelines

(To be added when tests are implemented)

- Write unit tests for all public APIs
- Test error conditions
- Test edge cases
- Maintain >80% coverage

## Release Process

(For maintainers only)

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create a git tag
4. Push with tags
5. Publish to npm

```bash
npm version patch|minor|major
npm publish
git push --follow-tags
```

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Check existing issues and PRs first

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- Focus on collaboration

Thank you for contributing! 🎉
