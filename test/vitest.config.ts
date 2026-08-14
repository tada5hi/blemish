import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/unit/**/*.{test,spec}.{js,ts}'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,tsx,js,jsx}'],
            // 100 across the board, and affordable: the package is ~60
            // statements of pure functions with no engine, no I/O and no
            // framework, so there is no category of code here that is
            // legitimately hard to reach. Treat a drop as a real gap.
            //
            // Note this measures only the RUNTIME surface. A large share of
            // what this package is lives in the type system, which coverage
            // cannot see — `npm run build:types` is the other half.
            thresholds: {
                branches: 100,
                functions: 100,
                lines: 100,
                statements: 100,
            },
        },
    },
});
