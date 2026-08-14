# Reference — validup

- **Repo**: https://github.com/tada5hi/validup
- **Local checkout**: `/opt/projects/tada5hi/validup`
- **Relationship**: origin of this package, and its primary consumer. `validup` depends on `blemish` at runtime and re-exports the whole surface, so its own public API is unchanged by the extraction.
- **Tracking issue**: [tada5hi/validup#464](https://github.com/tada5hi/validup/issues/464)

## Why the extraction happened

[tada5hi/rapiq#914](https://github.com/tada5hi/rapiq/pull/914) adopted this exact model by hand — the same `IssueItem` / `IssueGroup` union, the same `type` discriminant, the same absolute-path rule, and its own copies of `defineIssueItem` / `defineIssueGroup` / `flattenIssueItems` / `flattenIssueGroups` / `prefixIssuePath`. It reimplemented rather than depended because, as a dependency of `@rapiq/core`, `validup` does not fit:

| Objection | Solved by extraction? |
|---|---|
| `engines: node >=24` against rapiq's Node 22 baseline, where `@rapiq/core` declares none | **yes** — `blemish` declares no `engines` at all |
| four transitive deps (`@ebec/core`, `pathtrace`, `smob`, `twinop`) for ~40 lines of pure functions | **yes** — `blemish` has zero |
| layer mismatch (`Container` mounts validators on static keys; rapiq resolves keys dynamically) | no — out of scope |
| vocabulary mismatch (`IssueCode` vs rapiq's `ErrorCode`) | no — rapiq's codes use the raw `IssueItem` branch, which needs no coordination |

Only the first two were blocking, and both are resolved.

## Symbol mapping

| `validup` (before)                                         | `blemish` (now)      | Notes |
|------------------------------------------------------------|----------------------|-------|
| `src/issue/types.ts`                                        | `src/types.ts`       | `meta` JSDoc rewritten to be library-neutral; `validup`'s `optional` / `external` keys demoted from "library-owned" to a worked example. |
| `src/issue/constants.ts`                                    | `src/constants.ts`   | Vocabulary identical (24 codes). Docs reworded from "adapter packages" to "producers"; augmentation example retargeted to `declare module 'blemish'`. A stale `{{min}}` double-brace in the JSDoc was corrected to `{min}` — `interpolate`'s regex is `/\{(\w+)\}/g`, single braces. |
| `src/issue/define.ts`                                       | `src/define.ts`      | **Behaviour identical; one type fixed.** See "The `never` collapse" below. `DefineIssueItemData` / `DefineIssueItemReturn` are now exported (were module-private). |
| `src/issue/check.ts`                                        | `src/check.ts`       | `isObject` inlined from `validup`'s `src/utils/object.ts` instead of imported. |
| `src/issue/flatten.ts`                                      | `src/flatten.ts`     | Verbatim. |
| `src/issue/format.ts`                                       | `src/format.ts`      | `interpolate` inlined from `@ebec/core` rather than imported+re-exported. Signature and behaviour reproduced exactly. |
| `Container.prefixIssuePath` (private method, `src/container/module.ts`) | `src/prefix.ts` → `prefixIssuePath` | Promoted to a free function. `this.` recursion → direct recursion; parameter renamed `keyParts` → `prefix`. Semantics unchanged. |

### Stayed in `validup` (deliberately)

`ValidupError`, `isValidupError`, `createValidupError`, `errorToIssues`, `buildOneOfFailedGroup`, `buildErrorMessageForAttribute(s)` — all carry `validup` semantics or depend on `@ebec/core`'s `BaseError`.

## Two defects found by the extraction

### The `never` collapse — **also present in `validup`**

`DefineIssueItemReturn<C>` spelled `ResolveIssueCode<C>` inline at each use, which collapses the whole alias to `never`. `blemish` fixes it by hoisting the resolved code into a defaulted type parameter (`DefineIssueItemReturn<C, R = ResolveIssueCode<C>>`).

**`validup` on `master` still has this.** Verified directly:

```bash
cd packages/validup && cat > probe.ts <<'EOF'
import { IssueCode, defineIssueItem } from './src';
const a = defineIssueItem({ path: [], message: 'x', code: IssueCode.MIN_LENGTH, data: { min: 3 } });
const bad: { checkme: 1 } = a;   // compiles ⇒ `a` is `never`
EOF
npx tsc --noEmit --ignoreConfig --strict --target ES2022 --module ESNext \
    --moduleResolution bundler --skipLibCheck probe.ts   # exits 0
```

It is invisible there because `validup` typechecks only `src` (documented in its own `.agents/testing.md`: "Specs are not typechecked, in any package"), and because the failure is silent in both usual directions — branch *selection* still works so the gatekeep still rejects bad payloads, and `never` is assignable to everything so no call site complains. The consequence is that consumer-side narrowing on a `defineIssueItem` result silently means nothing.

**Follow-up for `validup`:** once it consumes `blemish`, this is fixed by the dependency. `packages/validup/test/unit/issue.spec.ts` should gain the same `IsNever` assertions, and `validup` should extend its `tsconfig.json` `include` to `test/**/*` — its `@validup/validator-js` package already does exactly this.

### The `{{min}}` / `{min}` doc drift

`IssueCode`'s JSDoc in `validup` promised placeholders as `{{min}}` / `{{max}}` / `{{other}}`, but `interpolate`'s regex is `/\{(\w+)\}/g` — single braces. A catalog author following the doc would have written templates that never substitute. Corrected in `blemish`; `validup` inherits the fix via the re-export, but its own docs site (`docs/src/guide/issues.md`) should be checked for the same wording.

## Compatibility properties, verified against built artifacts

Both were tested end-to-end (`blemish` dist → a stub re-exporting package's dist → a consumer), not assumed:

1. **`tsdown` emits `export * from "blemish"` rather than inlining declarations.** Inlining would break cross-package type identity *and* the augmentation path below.
2. **`declare module 'validup' { interface IssueDataByCode { … } }` keeps working.** Module augmentation targeting a package that only star-re-exports an interface still merges into the original declaration, and `ParameterizedIssueCode` — computed in `blemish` — picks the added code up. Confirmed through a two-hop `export *` chain. So the contract documented in `validup`'s `docs/src/guide/issues.md:265` and `.agents/architecture.md` survives unchanged.

## Migrating `validup` (not yet done)

Sketch, for whoever picks up #464's second half:

1. Add `"blemish": "^1.0.0"` to `packages/validup/package.json` dependencies.
2. Replace `packages/validup/src/issue/*` with a single `src/issue/index.ts` containing `export * from 'blemish';` — every intra-package `from '../issue'` import then keeps working untouched.
3. Delete `Container.prefixIssuePath` and import the free function; call sites are `container/module.ts` around lines 1360 and 1478.
4. Drop `@ebec/core`'s `interpolate` re-export (now comes from `blemish`); `@ebec/core` stays a dependency for `BaseError`.
5. Move `issue.spec.ts` / `flatten.spec.ts` and the `formatIssue` half of `format.spec.ts` out; keep the `Issue.data populated by the runtime` block, which tests `Container`, not the model.
6. Update the three documentation surfaces named in `validup`'s `.agents/conventions.md`, plus the dependency-layer diagram in its `.agents/structure.md`.
