# Contributing to p2p4everything

Thank you for your interest in contributing to p2p4everything! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect different viewpoints and experiences

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/yourusername/p2p4everything/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, browser, version)
   - Screenshots if applicable

### Suggesting Features

1. Check existing feature requests
2. Create an issue with:
   - Clear description of the feature
   - Use case and benefits
   - Potential implementation approach (if you have ideas)

### Pull Requests

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Write/update tests** if applicable
5. **Update documentation** if needed
6. **Commit your changes**: Use conventional commits
   ```
   feat: add file sharing feature
   fix: resolve WebRTC connection issue
   docs: update architecture documentation
   ```
7. **Push to your fork**: `git push origin feature/amazing-feature`
8. **Open a Pull Request**

## Development Setup

### Prerequisites

- Node.js 20+ (LTS)
- pnpm 8+ (or npm)
- Docker and Docker Compose (for local services)
- PostgreSQL 15+ (or use Docker)
- Redis 7+ (or use Docker)

### Setup Steps

1. **Clone your fork**
   ```bash
   git clone https://github.com/yourusername/p2p4everything.git
   cd p2p4everything
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. **Start local services**
   ```bash
   docker-compose up -d
   ```

5. **Run database migrations**
   ```bash
   pnpm db:migrate
   ```

6. **Start development server**
   ```bash
   pnpm dev
   ```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Avoid `any` types
- Use meaningful type names
- Document complex types

### Code Style

- Follow ESLint rules
- Use Prettier for formatting
- Maximum line length: 100 characters
- Use meaningful variable and function names
- Write self-documenting code

### Component Structure

```typescript
// Component example
import { useState } from 'react';

interface Props {
  // Props interface
}

export function ComponentName({ prop1, prop2 }: Props) {
  // Hooks
  const [state, setState] = useState();
  
  // Event handlers
  const handleClick = () => {
    // Handler logic
  };
  
  // Render
  return (
    <div>
      {/* JSX */}
    </div>
  );
}
```

### File Organization

- One component per file
- Co-locate related files
- Use index files for exports
- Group by feature, not by type

## Testing

### Writing Tests

- Write tests for new features
- Maintain or improve test coverage
- Use descriptive test names
- Test edge cases and error conditions

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run E2E tests
pnpm test:e2e

# Check coverage
pnpm test:coverage
```

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat: add file sharing via WebRTC
fix: resolve connection timeout issue
docs: update deployment guide
refactor: simplify encryption key management
```

## Pull Request Process

1. **Update documentation** if your PR changes functionality
2. **Add tests** for new features or bug fixes
3. **Ensure all tests pass**
4. **Update CHANGELOG.md** if applicable
5. **Request review** from maintainers
6. **Address review feedback**
7. **Squash commits** if requested

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] All tests pass
- [ ] No new warnings or errors
- [ ] CHANGELOG updated (if applicable)

## Security

### Reporting Security Issues

**Do NOT** open public issues for security vulnerabilities.

Instead, email security issues to: security@p2p4everything.com

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Security Best Practices

- Never commit secrets or API keys
- Use environment variables for sensitive data
- Validate and sanitize all inputs
- Follow secure coding practices
- Keep dependencies updated

## Documentation

### Code Documentation

- Document public APIs
- Add JSDoc comments for functions
- Explain complex algorithms
- Include usage examples

### Documentation Updates

- Update README.md for user-facing changes
- Update architecture docs for system changes
- Add migration guides for breaking changes
- Keep API documentation current

## Review Process

1. Maintainers will review your PR
2. Address any feedback or requested changes
3. Once approved, your PR will be merged
4. Thank you for contributing! 🎉

## Getting Help

- **Documentation**: Check the `/docs` directory
- **Discussions**: Use GitHub Discussions
- **Issues**: Search existing issues
- **Discord/Slack**: Join our community (if available)

## Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Credited in release notes
- Appreciated by the community! 🙏

Thank you for helping make p2p4everything better!

