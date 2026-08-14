# Testing

## Setup

- **Runner**: Vitest 4, v8 coverage provider
- **Test location**: `test/unit/**/*.{test,spec}.{js,ts}`
- **Config**: `test/vitest.config.ts` (there is no root-level Vitest config)
- **Environment**: default Node — nothing here touches a DOM
- **Prerequisite**: `npm install`. No build step, no services, no fixtures directory.

Specs import from source, not from `dist`:

```ts
import { defineIssueItem } from '../../src';
```

`globals` is **not** enabled. Import `describe` / `it` / `expect` from `vitest` explicitly in every spec — every spec in the repo does.

## Running Tests

```bash
npm run test            # all specs
npm run test:coverage   # + v8 coverage report
npm run test:types      # tsc --noEmit over src AND test  ← not covered by `npm run test`
npm run lint

npx vitest --config test/vitest.config.ts --run test/unit/prefix.spec.ts   # a single spec
```

## `npm run test:types` is half the suite

This package's most subtle defect to date was invisible to every runtime test, and it is the reason `tsconfig.json` includes `test/**/*`:

- `tsconfig.json` → `src` **and** `test`. Read by your editor and by `test:types`.
- `tsconfig.build.json` → `src` only. Read by `tsdown`, so specs can never influence the published `.d.mts`.

Two categories of case depend entirely on that command:

1. **`@ts-expect-error` directives** are inert in every automated context unless a `tsc` run covers the file. A directive above a call that no longer errors becomes `TS2578: Unused '@ts-expect-error' directive` — but only if something typechecks it.
2. **`IsNever` assertions** in `define.spec.ts`. `never` is assignable to everything, so a return type collapsing to `never` breaks no call site and changes no runtime behaviour. Asserting `[T] extends [never] ? true : false` is `false` is the only thing that sees it. (The tuple wrapper matters — a bare `T extends never` distributes and gives the wrong answer for union returns.)

**Verify both non-vacuously by mutation.** Reverting `DefineIssueItemReturn` to its inline form produces nine errors; collapsing `DefineIssueItemData`'s conditional to a permissive `{ data?: any }` turns every negative case into `TS2578`. If a type-level case is added and mutating the source leaves the check green, the case is decorative — fix it or delete it.

If you need to typecheck a single file standalone, note the trap: `tsc <file>` with a `tsconfig.json` present dies with `TS5112` having checked nothing. The working form is

```bash
npx tsc --noEmit --ignoreConfig --strict --target ES2022 --module ESNext \
    --moduleResolution bundler --skipLibCheck <file>.ts
```

## Layout

```
test/
├── vitest.config.ts
└── unit/
    ├── check.spec.ts       # the three duck-typed guards, incl. deep-nesting rejection
    ├── constants.spec.ts   # the IssueCode vocabulary: contents, casing, key↔value alignment
    ├── define.spec.ts      # both factories, the typed-data gatekeep, the return-type assertions
    ├── flatten.spec.ts     # both pre-order walks, ordering, reference identity
    ├── format.spec.ts      # formatIssue resolution order + interpolate parity
    └── prefix.spec.ts      # the absolute-path invariant
```

One spec per `src` module, same basename. When adding a module, add its spec.

## Coverage

Thresholds are **100 for statements, branches, functions and lines** — set in `test/vitest.config.ts`, collected from `src/**/*`.

That bar is affordable because the package is ~60 statements of pure functions with no engine, no I/O and no framework. Treat a drop as a real gap, not as a number to lower: there is no category of code here that is legitimately hard to reach. Coverage does **not** measure the type-level surface, which is a large fraction of what this package actually is — 100% line coverage and a broken `DefineIssueItemReturn` coexisted happily.

## Traps that make cases here pass vacuously

Each of these was hit while writing the current suite.

**A recursion test needs a tree deep enough to distinguish recursion from its absence.** `prefixIssuePath` on a one-level group passes whether or not it recurses. The load-bearing case is a three-level tree asserted through `flattenIssueItems`, plus a companion case pinning that the prefix applied at depth is the *original* one rather than the accumulated path — those are two different wrong implementations and one test cannot see both.

**An "absence" assertion needs to distinguish absent from wrong.** `expect(output.path).toEqual([...])` on a copy says nothing about whether the input was mutated. The non-mutation case has to hold references to the original nodes and assert on *those* afterwards.

**A shallow-copy contract needs `toBe`, not `toEqual`.** `data` and `meta` are carried over by reference; `toEqual` passes for a deep clone too, which is a different (and more expensive) contract.

**A "returns the input, not a derivative" contract needs a fixture where the two differ.** `flattenIssueItems` returning live references is asserted with `toBe` against the exact objects put in — `toEqual` would pass for copies.

**An enumeration test should assert the whole list, not membership.** `constants.spec.ts` asserts `Object.values(IssueCode)` equals the full ordered array rather than calling `toContain` 24 times: the `toContain` form cannot see an *added* code, which is precisely the drift the README's table needs to stay in sync with.

## Writing New Tests

1. Put the spec in `test/unit/<module>.spec.ts`, matching the `src` module name.
2. Import `describe` / `it` / `expect` from `vitest` explicitly; import the units under test from `'../../src'`.
3. Add the copyright header (see [conventions.md](conventions.md#copyright-header)).
4. Run `npm run test`, `npm run test:types` and `npm run lint`.
5. If the case is type-level, mutate the source and confirm it fails before believing it.
