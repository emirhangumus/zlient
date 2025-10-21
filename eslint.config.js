import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
    js.configs.recommended,
    {
        files: ['lib/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
                project: './tsconfig.json',
            },
            globals: {
                console: 'readonly',
                process: 'readonly',
                globalThis: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                AbortController: 'readonly',
                Request: 'readonly',
                Response: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            'no-console': 'off',
        },
    },
    prettier,
    {
        ignores: ['dist/**', 'node_modules/**', '*.config.js', '*.config.ts'],
    },
];
