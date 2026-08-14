# Project Structure

## Directory Layout

```
blemish/
├── src/
│   ├── types.ts        # IssueBase, IssueItem{Typed,Bare,Raw}, IssueGroup, Issue, ResolveIssueCode
│   ├── constants.ts    # IssueCode, IssueDataByCode, ParameterizedIssueCode, BareIssueCode
│   ├── define.ts       # defineIssueItem, defineIssueGroup (+ their conditional-type signatures)
│   ├── check.ts        # isIssue, isIssueItem, isIssueGroup
│   ├── flatten.ts      # flattenIssueItems, flattenIssueGroups
│   ├── prefix.ts       # prefixIssuePath
│   ├── format.ts       # formatIssue, interpolate, IssueMessageTemplates
│   └── index.ts        # barrel — re-exports every module wholesale
├── test/
│   ├── vitest.config.ts
│   └── unit/           # one spec per src module, same basename
├── .agents/
│   └── references/     # cumulative mapping to external projects (validup)
├── assets/logo.svg
├── tsconfig.json       # editor + `build:types` — includes src AND test
├── tsconfig.build.json # emission — src only
├── tsdown.config.ts    # entry src/index.ts, esm, dts, tsconfig: tsconfig.build.json
└── package.json        # NO dependencies, NO engines — both deliberate
```

**The layout is flat on purpose.** Roughly 60 statements of runtime code across seven modules; per-directory barrels would be ceremony. If a module ever grows subdirectories, add an `index.ts` barrel for it and re-export from `src/index.ts` — but prefer keeping it flat.

## Module Responsibilities

| Module         | Purpose                                                                                                                                                      |
|----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `types.ts`     | The model. `IssueBase` (`path` / `message` / `data` / `meta`), the three-branch `IssueItem` union, `IssueGroup`, and `ResolveIssueCode` (the `code: undefined → VALUE_INVALID` default, lifted to the type level). Carries the long-form documentation of the `path` invariant and the `meta` governance rule. |
| `constants.ts` | The default vocabulary — `IssueCode` (24 entries) plus `IssueDataByCode`, the declaration-merging extension point that the typed branches and the producer gatekeep are derived from. |
| `define.ts`    | The two factories, plus `DefineIssueItemData<C>` / `DefineIssueItemReturn<C, R>` — the conditional types that select the per-code `data` requirement at the call site. The `R` type parameter is load-bearing; see [architecture.md](architecture.md#the-never-collapse). |
| `check.ts`     | Duck-typed structural guards. Holds a private four-line `isObject` (inlined rather than depended upon) and a private `isIssuePath` / `isBaseIssue` pair.        |
| `flatten.ts`   | The two pre-order walks. Return **live references** into the tree, not copies.                                                                                 |
| `prefix.ts`    | `prefixIssuePath` — the rebase step that maintains the absolute-path invariant. Returns **copies**; recurses into groups.                                       |
| `format.ts`    | `formatIssue` (template → eager `message` → fallback) and an inlined `interpolate` reproducing `@ebec/core`'s behaviour exactly, including its two quirks.      |

## Key Dependencies

**None.** `package.json` has no `dependencies` block, and adding one is a breaking change to the package's reason for existing. Two things were inlined rather than imported:

| Inlined       | Was                    | Where          | Note                                                                                     |
|---------------|------------------------|----------------|------------------------------------------------------------------------------------------|
| `isObject`    | `validup`'s `utils/`   | `check.ts`     | Four lines, module-private, not exported.                                                  |
| `interpolate` | `@ebec/core`           | `format.ts`    | Six lines, **is** exported — `validup` re-exports it publicly, so the signature and every behavioural quirk must stay identical. See [architecture.md](architecture.md#interpolate-is-a-faithful-reproduction). |

`devDependencies` are the standard `tada5hi` toolchain: `@tada5hi/{eslint-config,tsconfig,commitlint-config}`, `eslint`, `typescript`, `tsdown`, `vitest`, `@vitest/coverage-v8`, `husky`.

## Package Exports

```json
{
    "exports": {
        "./package.json": "./package.json",
        ".": {
            "types": "./dist/index.d.mts",
            "import": "./dist/index.mjs"
        }
    }
}
```

ESM-only, single entry point. **`src/index.ts` re-exports every module wholesale**, so there is no internal/public split — everything in `src/` is public API and semver-protected. If something genuinely needs to stay private, keep it module-scoped (as `isObject` / `isBaseIssue` / `isIssuePath` are) rather than exporting it and hoping nobody notices.

## Who Consumes This

| Consumer   | Relationship                                                                                                            |
|------------|-------------------------------------------------------------------------------------------------------------------------|
| `validup`  | Runtime dependency. Re-exports the whole surface via `export * from 'blemish'`, so every pre-extraction import path and type identity is preserved for its consumers. |
| `rapiq`    | The second consumer this package was extracted for — had hand-copied the same model. Uses its own `ErrorCode` vocabulary on the raw `IssueItem` branch. |

**Type identity across those consumers depends on a real `export *` surviving the bundler.** `tsdown` emits `export * from "blemish"` rather than inlining the declarations — verified, and worth re-verifying if the build toolchain changes, because inlining would silently break both cross-package type identity and the `declare module '<re-exporting-package>'` augmentation path.

## Separation of Concerns

- **The shape of an issue** → `types.ts`
- **What codes mean and what `data` they require** → `constants.ts`
- **Producing a well-formed issue** → `define.ts`
- **Keeping paths absolute while merging trees** → `prefix.ts`
- **Reading a tree** → `flatten.ts`, `check.ts`
- **Turning an issue into a string** → `format.ts`
