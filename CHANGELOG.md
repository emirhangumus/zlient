# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive examples directory with real-world usage patterns
- ESLint and Prettier for code quality
- Development tooling and scripts
- Full documentation (README, CONTRIBUTING, PROJECT_STRUCTURE)

### Changed
- Restructured project to follow npm package best practices
- Moved source from `src/api/` to `lib/`
- Improved build configuration with Rolldown
- Enhanced TypeScript configuration with stricter settings
- Updated package.json with comprehensive metadata

### Fixed
- TypeScript type issues in query string builder
- RequestInfo type compatibility

## [1.0.0] - 2025-10-22

### Added
- Initial release
- HttpClient with retry logic and timeout support
- BaseEndpoint for type-safe API endpoints
- Multiple authentication providers (Bearer Token, API Key, Custom)
- Request/Response interceptors
- Zod schema validation
- Common reusable schemas (Id, Timestamps, Meta, etc.)
- Dual format support (ESM + CommonJS)
- Full TypeScript support with declaration files
- Source maps for debugging

### Features
- 🔒 Type-safe HTTP client framework
- ✅ Runtime validation with Zod schemas
- 🔄 Configurable retry strategies
- 🎯 Multiple authentication methods
- 🪝 Before/after request hooks
- ⏱️ Request timeout configuration
- 📦 Multiple base URL support
- 🌳 Tree-shakeable exports

[unreleased]: https://github.com/emirhangumus/zlient/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/emirhangumus/zlient/releases/tag/v1.0.0
