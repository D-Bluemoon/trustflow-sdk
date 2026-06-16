# Linting and Code Quality

This project enforces clean code standards using ESLint and Prettier.

## Available Commands

### Standard Linting
```bash
npm run lint          # Check for errors and warnings
npm run lint:fix      # Auto-fix fixable issues
```

### Strict Mode (Optional)
```bash
npm run lint:strict   # Run with strict type-checking rules
```

The strict mode includes additional rules:
- `@typescript-eslint/strict-boolean-expressions` - Explicit boolean comparisons
- `@typescript-eslint/no-floating-promises` - Proper promise handling
- `@typescript-eslint/explicit-function-return-type` - Explicit return types
- And more...

### Formatting
```bash
npm run format        # Auto-format all TypeScript files
npm run format:check  # Check if files are formatted
```

## Configuration Files

- `eslint.config.mjs` - Standard ESLint configuration
- `eslint.strict.config.mjs` - Strict mode configuration with type-checking
- `.prettierrc.json` - Prettier formatting rules
- `.prettierignore` - Files excluded from formatting

## TypeScript Strict Mode

The project uses TypeScript strict mode with additional compiler checks:
- `strict: true` - All strict type-checking options enabled
- `noUnusedLocals: true` - Disallow unused local variables
- `noUnusedParameters: true` - Disallow unused function parameters
- `noImplicitReturns: true` - Ensure all code paths return a value
- `noFallthroughCasesInSwitch: true` - Prevent switch case fall-through

## Pre-commit Integration (Recommended)

Consider using Husky to automatically lint before commits:

```bash
npm install -D husky lint-staged
npx husky init
```

Then add to `package.json`:
```json
{
  "lint-staged": {
    "src/**/*.ts": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

## VS Code Integration

Install the following extensions for the best experience:
- ESLint
- Prettier - Code formatter

Add to `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```
