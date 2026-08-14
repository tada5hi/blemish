import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: 'src/index.ts',
    format: 'esm',
    dts: true,
    sourcemap: true,
    // `tsconfig.json` additionally includes `test/**/*` so `npm run build:types`
    // checks the specs — in particular the `@ts-expect-error` cases pinning
    // `defineIssueItem`'s per-code `data` gatekeep, which are inert unless a
    // `tsc` run covers them. Emission reads the src-only config so specs can
    // never influence the published `.d.mts`.
    tsconfig: 'tsconfig.build.json',
});
