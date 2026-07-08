import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    files: ['src/**/*.{ts,tsx}', 'api/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      // Tech debt: ~28 `any` types in the codebase, mostly Supabase return values.
      // Tracked for incremental fix as we add proper Supabase-generated types.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // react-hooks v7 strict rules — disabled because these patterns are
      // intentional in this codebase:
      // - ref.current writes during render are the documented "sync latest ref"
      //   pattern for stale-closure avoidance.
      // - setState in useEffect body is used for one-time mount initialisation
      //   (e.g. restoring from localStorage), not cascading updates.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // Date.now() / Math.random() in render for display-only derived values is safe.
      'react-hooks/impure-functions': 'off',
      'react-hooks/purity': 'off',
    },
  },
  prettierConfig,
];
