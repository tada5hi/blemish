# Architecture

There is one noun — **Issue** — and no verbs beyond building, rebasing, walking and rendering it. Everything in this package is `(data) => data`. If a change requires state, I/O, or a dependency, it belongs in a consumer, not here.

## The model

```ts
type Issue = IssueItem | IssueGroup;   // discriminated by `type`

interface IssueBase {
    path: PropertyKey[],               // ABSOLUTE, at every depth
    message: string,                   // eager, English
    data?: Record<string, unknown>,    // narrowed per branch on IssueItem
    meta?: Record<string, unknown>,    // open provenance bag
}
```

An `IssueItem` is a leaf; an `IssueGroup` carries `issues: Issue[]` and is what preserves *why* a set of failures belongs together (the branches of a failed `oneOf`, one nested sub-structure, one collection element). A consumer that does not care flattens; one that does walks.

## The absolute-path invariant

**Every node carries its full path from the root, not one relative to its parent.** This is the load-bearing rule. It is what makes `flattenIssueItems` produce a directly indexable list, and it is the reason a consumer never walks the tree merely to discover where a leaf belongs.

The invariant is **maintained by the producer, not enforced by the model.** Nothing in `check.ts` verifies it — a tree with relative paths is structurally valid and semantically wrong. `prefixIssuePath` is the step that upholds it, and it is exported precisely so that every producer performs it identically instead of rediscovering the same bug.

That bug is specific and worth naming: rebasing **only the node you were handed** passes every shallow test. It fails exactly when a child already wrapped its own failures in a group — the inner leaves surface missing the parent segment, and per-field lookup mis-indexes them. `prefix.ts` therefore recurses into `issues`, and `test/unit/prefix.spec.ts` pins it with a three-level tree. Two properties are asserted alongside it, because both are ways the recursion can be wrong rather than absent:

- the prefix applied at depth is the **original** `prefix`, not the accumulated `prefixed.path` (which would compound as it descends);
- the input tree is **never mutated** — each visited node is shallow-copied and a group's `issues` array is rebuilt, so the whole spine is fresh. `data` and `meta` are carried over **by reference**; that aliasing is documented and pinned, not accidental.

Copying is unconditional, including for an empty prefix. There is no identity fast-path, and a caller may rely on always getting a detached object back.

## The three-branch `IssueItem`

`IssueItem` is a union over `code`, not a single interface with an optional `data`:

| Branch           | `code`                        | `data`                              |
|------------------|-------------------------------|-------------------------------------|
| `IssueItemTyped` | one `ParameterizedIssueCode`  | **required**, typed per `IssueDataByCode` |
| `IssueItemBare`  | one `BareIssueCode`           | must be absent / `undefined`        |
| `IssueItemRaw`   | `string & {}` (ad-hoc)        | open `Record<string, unknown>`      |

The first two are **distributed** mapped types (`{ [K in Codes]: … }[Codes]`) rather than a single member with a union `code`. That distribution is what makes `Extract<IssueItem, { code: 'min_length' }>` resolve to the one concrete variant with `data: { min: number }` instead of the joined union. Collapsing them into a non-distributed form would compile and would quietly destroy per-code narrowing.

`ParameterizedIssueCode` / `BareIssueCode` are **derived** from `IssueDataByCode` (`keyof` and `Exclude<IssueCode, keyof …>` respectively). Adding a code to `IssueDataByCode` therefore moves it from bare to typed automatically — which is exactly what makes the declaration-merging extension point work, and also means the two lists cannot drift.

### Consumer-side narrowing has a known limitation

`IssueItemRaw`'s `code: string & {}` accepts any string at the type level, so it overlaps the literal codes. `if (issue.code === IssueCode.MIN_LENGTH) issue.data.min` types as `number | unknown | undefined` rather than `number`. This is accepted, not a bug to fix: the producer-side gatekeep is the primary safety net, and consumers needing a clean narrow use `Extract<IssueItem, { code: 'min_length' }>` or cast after the equality check. Removing the raw branch to fix it would break ad-hoc codes, which are the whole cross-library story.

## The producer gatekeep

`defineIssueItem`'s parameter type selects the `data` requirement from the supplied `code`:

```ts
type DefineIssueItemData<C> = DefineIssueItemCommon & { code?: C } & (
    ResolveIssueCode<C> extends ParameterizedIssueCode ?
        { data: IssueDataByCode[ResolveIssueCode<C> & ParameterizedIssueCode] } :
        ResolveIssueCode<C> extends BareIssueCode ?
            { data?: undefined } :
            { data?: Record<string, unknown> }
);
```

So `MIN_LENGTH` without `data: { min }` is a compile error, `EMAIL` *with* any `data` is a compile error, and an ad-hoc code takes anything. This is what makes a translation catalog safe to write: a template referencing `{min}` cannot meet a `min_length` issue lacking it.

`ResolveIssueCode<C>` exists so an **omitted** `code` resolves to `VALUE_INVALID` at the type level, matching the runtime `||` default, so the bare branch is selected rather than the raw catch-all. The `[C] extends [undefined]` tuple wrapper is deliberate — it tests the whole `C` without distributing over union members.

### The `never` collapse

`DefineIssueItemReturn` takes a second type parameter that is **not an argument**:

```ts
export type DefineIssueItemReturn<C, R = ResolveIssueCode<C>> = R extends ParameterizedIssueCode ?
    Extract<IssueItemTyped, { code: R }> : …
```

Writing `ResolveIssueCode<C>` inline at each use — which is how this type was originally written, and how it still reads in `validup` — **collapses the entire alias to `never`**. `Extract` distributes over `IssueItemTyped`'s union, and with the target still expressed in terms of the alias's own type parameter no member is provably assignable, so every branch yields `never`.

**The reason this survived a long time is worth internalising: the failure is silent in both directions that normally catch things.**

- Branch *selection* keeps working, so `defineIssueItem` still rejects a bad payload. The gatekeep — the half anyone would think to test — was never broken.
- `never` is assignable to everything, so no call site complains, no runtime test changes, and downstream code that should have been type-checked against a concrete variant simply is not.

It surfaced here only because `tsconfig.json` includes `test/**/*` and `npm run test:types` runs — the same specs had been green in `validup` for as long as they existed, because `validup` typechecks only `src`. `test/unit/define.spec.ts` now pins it with an explicit `IsNever<T> = [T] extends [never] ? true : false` assertion per branch, verified non-vacuous by reverting the fix and watching nine errors appear.

**Generalise it:** a conditional type whose branches are `Extract`s can degenerate to `never` without any symptom a runtime test or a negative type test can see. When a type-level helper is load-bearing, assert what it resolves *to*, not only what it rejects.

## `interpolate` is a faithful reproduction

`format.ts` reimplements `@ebec/core`'s `interpolate` so the package can stay dependency-free. It is a **reproduction, not a rewrite** — `validup` re-exports this function publicly under the same name, so any behavioural difference is a stealth break for its consumers. Two inherited properties are therefore kept and asserted rather than cleaned up:

- a custom `regex` must carry the `g` flag (`String.prototype.matchAll` throws without it);
- substitution goes through `String.prototype.replace` with a *string* replacement, so `$&`, `` $` ``, `$'` and `$1` inside a **substituted value** are expanded as replacement patterns rather than kept literal.

The second is a latent footgun. It is pinned in `test/unit/format.spec.ts` with a comment saying so, precisely so that fixing it becomes a deliberate, versioned decision instead of an accidental one.

The substitution gate is `typeof data[key] !== 'undefined'`, **not** truthiness — `0`, `''`, `false` and `null` are legitimate values for codes like `MIN_LENGTH`. A missing key leaves the placeholder verbatim so a partial `data` degrades to a readable template rather than to `"undefined"`.

## Guards are duck-typed

`isIssue` / `isIssueItem` / `isIssueGroup` check structure, never `instanceof`. This is not defensive habit — it is the requirement that makes the package's purpose achievable. A tree assembled from two libraries, or from two copies of this package (npm hoisting, pnpm's strict linker), or across a realm boundary, has no shared class to test against. `isIssueGroup` recurses, so a group only passes when every descendant is well-formed.

## `meta` governance

`meta` is `Record<string, unknown>` by design: issues cross library boundaries, and the library that produced one routinely knows things the library rendering it does not. Keys are owned by whoever writes them.

The bar a library should hold itself to before claiming a key is **provenance the consumer cannot reconstruct**. Two tempting things that fail it:

- **Presentation tokens** (`severity`, `variant`, `color`) — a rendering decision, so they belong to the renderer.
- **Facts the caller supplied** (the active validation group, the requested locale) — the caller can join those back itself.

`blemish` itself claims **no** keys. `validup` claims two (`optional`, `external`) and documents them on its own surface.

## Data flow

```
Producer (a validation library)
  │
  ├── defineIssueItem / defineIssueGroup      → well-formed nodes, `data` gatekept
  ├── prefixIssuePath (on every merge)        → absolute paths preserved
  ▼
Issue[]  ── crosses a package boundary ──▶  Consumer
                                              │
                                              ├── isIssue*        → validate a foreign tree
                                              ├── flattenIssue*   → index by field / walk groups
                                              └── formatIssue     → localized string
```

## Error handling

There is none, and that is the design. No function here throws: `prefixIssuePath` tolerates a malformed issue with no `path` (`issue.path || []`), `formatIssue` tolerates a missing `data` and a non-string template entry, `interpolate` tolerates missing keys, and the guards return `false` rather than raising. Issues arrive from other packages and are frequently not something this package produced, so the model degrades instead of rejecting.
