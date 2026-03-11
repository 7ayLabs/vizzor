# Contributing to Vizzor

Thank you for your interest in contributing to Vizzor. This document provides guidelines and information for contributors.

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## Development Setup

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 10.0.0
- Git

### Getting Started

```bash
# Clone the repository
git clone https://github.com/7ayLabs/vizzor.git
cd vizzor

# Install dependencies
pnpm install

# Set up configuration
pnpm dev config init

# Run in development mode
pnpm dev scan ethereum

# Run tests
pnpm test
```

## Branch Strategy

We use a structured branching model with three protected branches:

```
main (production, tagged releases)
  ↑ merge from testing
testing (QA/staging)
  ↑ merge from release branches
release/v0.x.x (versioned integration)
  ↑ merge from develop
develop (integration)
  ↑ merge from feature/fix branches
```

### Branch Naming

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feat/` | New features | `feat/scanner-project-analyzer` |
| `fix/` | Bug fixes | `fix/config-loader-validation` |
| `refactor/` | Code restructuring | `refactor/chains-adapter-interface` |
| `docs/` | Documentation | `docs/readme-api-keys` |
| `ci/` | CI/CD changes | `ci/add-coverage-report` |
| `release/` | Release branches | `release/v0.2.0` |

### Workflow

1. Create a branch from `develop` with the appropriate prefix
2. Make your changes with conventional commits
3. Open a PR targeting `develop`
4. CI must pass before merge
5. Release branches are created from stable `develop` state
6. Release branches go through `testing` before merging to `main`

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

`feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `security`

### Scopes

`cli`, `scanner`, `trends`, `forensics`, `ai`, `chains`, `data`, `config`, `discord`, `telegram`, `adapters`, `ci`, `deps`

### Examples

```
feat(scanner): add project risk scoring engine
fix(chains): handle RPC timeout in EVM adapter
docs(readme): add installation and usage guide
test(forensics): add rug detector unit tests
refactor(ai): extract prompt templates to separate files
```

## Code Style

- **TypeScript** strict mode enabled
- **ESLint** for linting — run `pnpm lint`
- **Prettier** for formatting — run `pnpm format`
- Path aliases: use `@/` for imports from `src/`
- Prefer `type` imports: `import type { Foo } from './bar.js'`
- ESM only: use `.js` extensions in relative imports

### Pre-commit Hooks

Husky runs automatically on commit:
- **lint-staged**: ESLint + Prettier on staged files
- **commitlint**: validates commit message format

## Testing

- **Unit tests**: `test/unit/` — mirrors `src/` structure
- **Integration tests**: `test/integration/` — gated behind `VIZZOR_INTEGRATION=true`
- **E2E tests**: `test/e2e/` — CLI and bot end-to-end tests

Run tests:

```bash
pnpm test              # Unit tests
pnpm test:coverage     # With coverage report
pnpm test:integration  # Integration tests (requires API keys)
```

All PRs must pass unit tests. Integration tests run in CI with secrets.

## Pull Request Process

1. Ensure your branch is up to date with `develop`
2. All CI checks must pass
3. PRs to `develop` require CI pass
4. PRs to `main` require 1 review approval + CI pass
5. Use a descriptive title following conventional commit format
6. Fill out the PR template with relevant details

## Reporting Issues

Use the [issue templates](https://github.com/7ayLabs/vizzor/issues/new/choose) for bug reports and feature requests.

## License

By contributing, you agree that your contributions will be licensed under the [BUSL-1.1](LICENSE.md) license.
