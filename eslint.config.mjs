import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Ported rules from legacy .eslintrc.json configuration mapping
      'no-throw-literal': 'error',
      'no-param-reassign': 'warn',
      '@typescript-eslint/strict-boolean-expressions': 'warn'
    }
  }
);
