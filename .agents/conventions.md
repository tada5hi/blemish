# Conventions

## The two rules that outrank everything else

**1. `dependencies` stays empty.** This package exists so that a library which cannot afford `validup`'s four transitive dependencies can still share its issue model. Adding one — even a tiny one, even one the consumer probably already has — re-breaks that. When you need something small, inline it and note the provenance in a comment (`isObject` in `check.ts`, `interpolate` in `format.ts` both do). When you need something large, it belongs in the consumer.

**2. No `engines` field.** Nothing here touches a Node API; the emitted code is plain ES2022 that runs in browsers, Deno, Bun and workers. A `node` floor would be a false constraint, and it propagates into every downstream consumer's install — the specific objection that motivated the extraction. This deliberately deviates from the sibling packages (`twinop`, `pathtrace`, `ebec`, `ilingo` all declare one).

Both are easy to undo by accident during a dependency bump or a template sync. If a change touches `package.json`, check both.

## Tooling

| Tool                       | Purpose                                                        |
|----------------------------|----------------------------------------------------------------|
| `tsdown`                   | Build — ESM bundle + `.d.mts` from `src/index.ts`               |
| `tsc --noEmit`             | Typecheck, incl. the specs (`npm run test:types`)               |
| `vitest` + `@vitest/coverage-v8` | Test runner and coverage                                 |
| `eslint` (v10 flat config) | Lint, via `@tada5hi/eslint-config`                              |
| `commitlint`               | Conventional Commits, via `@tada5hi/commitlint-config`          |
| `husky`                    | Git hooks (`prepare: husky`; no project-level hooks committed)  |
| `release-please`           | Versioning, `CHANGELOG.md`, tags                                |
| `tada5hi/monoship`         | npm publish, from the release workflow                          |

## TypeScript

- Extends `@tada5hi/tsconfig`, overriding `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `noEmit: true`, `allowImportingTsExtensions: true`.
- Two configs, and the split is load-bearing: `tsconfig.json` includes `src` **and** `test` (editor + `test:types`); `tsconfig.build.json` includes `src` only and is what `tsdown` emits from. Do not "simplify" them into one — specs would start influencing the published declarations.
- `"type": "module"`, ESM-only output. No CJS build.
- Never commit `dist/`.

## Code Style

- **4 spaces**, LF, UTF-8, final newline (`.editorconfig`).
- **Single quotes**, trailing commas, semicolons (from the shared config).
- `@stylistic/object-curly-newline` requires a line break for objects with 3+ properties — `npm run lint:fix` handles it.
- Prefer `import type { … }` for type-only imports.
- ESLint here does **not** disable `@typescript-eslint/no-unused-vars` (unlike `validup`), so a symbol imported only for a `{@link}` in JSDoc will fail lint. Reference it as `` `Name` `` in backticks instead of importing it.

### Copyright header

Every file under `src/` and `test/` carries it. Build/config files (`tsdown.config.ts`, `eslint.config.js`, `test/vitest.config.ts`, `commitlint.config.mjs`) deliberately do **not** — matching the sibling-package template.

```ts
/*
 * Copyright (c) <year>.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */
```

## Naming

| Pattern              | Convention                                                                 |
|----------------------|----------------------------------------------------------------------------|
| Files                | kebab-case, matching the concept (`prefix.ts` → `prefixIssuePath`)          |
| Type guards          | `is<Thing>` returning a type predicate; duck-typed, never `instanceof`      |
| Factories            | `define<Thing>` returning the constructed value                             |
| `IssueCode` keys     | `UPPER_SNAKE`, exactly the uppercase of their `lower_snake_case` value — pinned by `constants.spec.ts` |
| Interfaces           | prefix with `I` **only** when a class implements it. Nothing here is a class, so the model types are plain unprefixed aliases/interfaces. |

## Documentation surfaces

Three surfaces describe this package. Update every one that mentions a changed thing **in the same pass** as the code change — a stale surface is a defect, not a follow-up.

| Surface                                | Audience                | Update when …                                                                     |
|----------------------------------------|-------------------------|-----------------------------------------------------------------------------------|
| `README.md`                            | npm / GitHub readers    | Public API, exports, the `IssueCode` table, install, usage examples change.        |
| JSDoc in `src/**`                      | Editors / API consumers | Any signature or contract change. The long-form invariants live here, not only in `.agents/`. |
| `AGENTS.md` + `.agents/*.md`           | Agents & contributors   | Layout, runtime behaviour, testing setup, tooling, release mechanics change.        |

**README code samples are expected to run.** The usage, localization and rebasing examples were executed and their output pasted verbatim. If you change one, run it.

When a change affects `validup`'s re-exported surface, also update `.agents/references/validup.md`.

## Commit Convention

**[Conventional Commits](https://www.conventionalcommits.org/)**, enforced by commitlint. The type drives release-please's version bump.

```
<type>[optional scope]: <description>
```

Common types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `chore(deps)`.

## Release Process

- **release-please** owns `CHANGELOG.md`, the `package.json` version and `.release-please-manifest.json`. Never hand-edit them.
- Single package at the repo root (`"packages": { ".": {} }`), `include-component-in-tag: false`, `include-v-in-tag: true`, `bump-minor-pre-major: true`.
- The manifest and `package.json` both start at `0.0.0`. To cut `1.0.0` as the first release rather than `0.1.0`, add a `Release-As: 1.0.0` footer to the release commit or set `release-as` in `release-please-config.json`.
- Publishing runs `tada5hi/monoship@v2` from `.github/workflows/release.yml` on push to `master`.

## CI/CD

- `.github/workflows/main.yml` — install → build → (lint, test) on push/PR to `develop`, `master`, `next`, `beta`, `alpha`. Node 24.
- `.github/workflows/release.yml` — release-please on push to `master`; on a release commit, build and publish.
- **`test:types` is not yet a CI step.** It should be added to `main.yml`; until then, run it locally before pushing (see [testing.md](testing.md#npm-run-testtypes-is-half-the-suite) for why the runtime suite alone is not sufficient).

## Workflow

Before calling any change done, run all four:

```bash
npm run build && npm run test && npm run test:types && npm run lint
```

`npm run test` alone cannot see a type-level regression, and this package is substantially a type-level artifact.

## References

External project references live in `.agents/references/`. When looking up code in a referenced project, update the corresponding file with the source path/symbol there, the corresponding path/symbol here, and any behavioural differences — so the mapping accumulates instead of being re-derived.

- [validup](references/validup.md) — the origin of this package and its primary consumer.
