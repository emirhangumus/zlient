import { defineConfig } from 'rolldown';

export default defineConfig({
    input: './lib/index.ts',
    output: [
        {
            format: 'esm',
            file: './dist/index.js',
            sourcemap: true,
        },
        {
            format: 'cjs',
            file: './dist/index.cjs',
            sourcemap: true,
        },
    ],
    external: ['zod'],
    resolve: {
        extensions: ['.ts', '.js'],
    },
    platform: 'node',
    treeshake: {
        moduleSideEffects: false,
    },
});