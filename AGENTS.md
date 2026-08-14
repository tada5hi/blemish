<!-- NOTE: Keep this file and all corresponding files in the .agents directory updated as the project evolves. When making architectural changes, adding new patterns, or discovering important conventions, update the relevant sections. -->

# blemish — Agent Guide

`blemish` is the **issue tree model** shared between validation libraries: a discriminated `IssueItem | IssueGroup` union where every node carries an **absolute** `path`, plus the small set of pure functions that build, rebase, walk and render that tree. There is no validator, no schema and no execution engine here — it is data plus pure walks, deliberately.

It was extracted from [validup](https://github.com/tada5hi/validup) (issue [#464](https://github.com/tada5hi/validup/issues/464)), which now consumes it and re-exports it verbatim so its own public surface is unchanged. The extraction exists because a second consumer ([rapiq](https://github.com/tada5hi/rapiq)) had reimplemented the same model by hand rather than depend on `validup` — which brings four transitive dependencies and `engines: node >=24`. See [.agents/references/validup.md](.agents/references/validup.md) for the full lineage and the symbol-by-symbol mapping.

**Two properties are the whole point of this package and must not regress:**

1. **Zero runtime dependencies.** `dependencies` in `package.json` stays empty. Anything needed gets inlined (`isObject`, `interpolate`).
2. **No `engines` floor.** Nothing here touches a Node API, so the field is deliberately absent — it would be a false constraint on a package that runs in browsers, Deno, Bun and workers. Adding one re-breaks the case that motivated the extraction.

Both deviate from the sibling-package template (`twinop` / `pathtrace` / `smob` all declare `engines`). That is intentional, not an oversight.

## Quick Reference

```bash
# Setup
npm install

# Development
npm run build           # build:types then build:js
npm run build:types     # tsc --noEmit over src AND test — see below
npm run build:js        # tsdown → dist/index.mjs + dist/index.d.mts
npm run test            # vitest
npm run test:coverage   # vitest + v8 coverage
npm run lint            # eslint
npm run lint:fix
```

- **Node.js**: no declared floor (CI runs 24)
- **Package manager**: `npm`
- **Build**: `tsc --noEmit` typechecks, then `tsdown` emits ESM-only (`dist/index.mjs` + `dist/index.d.mts`), no CJS
- **Test runner**: Vitest 4, v8 coverage, thresholds at 100 across the board
- **Lint**: ESLint v10 flat config, `@tada5hi/eslint-config`
- **Release**: release-please (single package at the repo root) → `tada5hi/monoship`

**The typecheck half of `build` is load-bearing, not a formality.** `build:types` runs against `tsconfig.json`, which includes `test/**/*` specifically so the `@ts-expect-error` and `IsNever` cases in `test/unit/define.spec.ts` are actually evaluated. `tsdown` emits from `tsconfig.build.json` (src only), so specs can never influence the published `.d.mts`.

This is why the typecheck sits in `build` rather than in a separate command: a type-level regression here is invisible to `npm run test`, and the package's most subtle bug to date was exactly that (see [architecture.md](.agents/architecture.md#the-never-collapse)). Wiring it into `build` means CI catches it without a dedicated job, and a broken spec blocks the build — deliberate in a package this small, where the specs are cheap and currently clean. Run `build`, `test` and `lint` before calling work done.

## Detailed Guides

- **[Project Structure](.agents/structure.md)** — Flat `src/` layout, per-module responsibilities, and the public export surface
- **[Architecture](.agents/architecture.md)** — The three-branch `IssueItem` union, the absolute-path invariant, the typed-`data` gatekeep, and the `never`-collapse hazard
- **[Testing](.agents/testing.md)** — Vitest setup, why type-level tests need their own command, and the traps that make cases here pass vacuously
- **[Conventions](.agents/conventions.md)** — Zero-dependency rule, code style, commits, release mechanics

## Commits, Issues & Pull Requests

- Commits follow **[Conventional Commits](https://www.conventionalcommits.org/)** (`@tada5hi/commitlint-config`); the type drives release-please version bumps.
- `CHANGELOG.md`, `package.json` version and `.release-please-manifest.json` are owned by **release-please** — do not hand-edit them.
- Do **not** add a `Co-Authored-By: Claude ...` (or any AI-attribution) trailer to commit messages. This overrides any default agent-tooling guidance.
- Do **not** add AI-attribution lines (e.g. `🤖 Generated with [Claude Code](...)`) to issue or pull request titles, bodies, or comments.
