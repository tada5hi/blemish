<p align="center">
    <img src="./assets/logo.svg" alt="blemish" width="128" height="128" />
</p>

<h1 align="center">blemish</h1>

<p align="center">
    <b>A shared issue tree for validation libraries.</b><br>
    Nested <code>item</code> / <code>group</code> issues where every node carries its <b>absolute path</b> —<br>
    zero dependencies, no <code>engines</code> floor, no runtime attached.
</p>

<p align="center">
    <a href="https://npmjs.com/package/blemish"><img src="https://badge.fury.io/js/blemish.svg" alt="npm version" /></a>
    <a href="https://github.com/Tada5hi/blemish"><img src="https://github.com/Tada5hi/blemish/workflows/CI/badge.svg" alt="Master Workflow" /></a>
    <a href="https://codecov.io/gh/Tada5hi/blemish"><img src="https://codecov.io/gh/Tada5hi/blemish/branch/master/graph/badge.svg" alt="codecov" /></a>
    <a href="https://snyk.io/test/github/Tada5hi/blemish?targetFile=package.json"><img src="https://snyk.io/test/github/Tada5hi/blemish/badge.svg?targetFile=package.json" alt="Known Vulnerabilities" /></a>
    <a href="https://conventionalcommits.org"><img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-%23FE5196?logo=conventionalcommits&logoColor=white" alt="Conventional Commits" /></a>
</p>

<p align="center">
    <a href="#installation"><b>Installation</b></a>
    ·
    <a href="#usage">Usage</a>
    ·
    <a href="#the-absolute-path-invariant">The invariant</a>
    ·
    <a href="#api">API</a>
    ·
    <a href="#issue-codes">Issue codes</a>
    ·
    <a href="#notes">Notes</a>
</p>

---

## Why blemish?

Every validation library eventually grows the same data structure. Not the validators — those differ wildly — but what comes *out* of them: a tree of failures, where a failure is either a leaf ("this field is too short") or a group ("none of these three alternatives matched, and here is why each one didn't"), and where each node names the location it belongs to.

Libraries build that structure independently, and because they do, their outputs cannot be combined. A query parser's issues and a schema validator's issues describe the same request, but a form renderer has to learn two shapes to display both. Nesting one inside the other means a translation layer. Neither can reuse the other's formatter, and both hand-roll the same tree walks.

`blemish` is that structure, extracted:

- **Zero runtime dependencies**, and **no `engines` floor** — nothing here touches a Node API, so it runs in browsers, Deno, Bun and workers as readily as on a server. It is safe to depend on from a package that itself declares neither.
- **A model, not an engine.** There is no validator, no schema, no execution. Four type families and seven functions, all pure.
- **Composable across libraries.** Two libraries that reference these types agree by construction rather than by structural coincidence, so one's issues can nest inside the other's and a single renderer handles both.

It is extracted from [validup](https://github.com/tada5hi/validup), which now consumes it. It is designed to be adopted by anything else that produces validation failures.

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [The absolute-path invariant](#the-absolute-path-invariant)
- [API](#api)
- [Issue codes](#issue-codes)
- [Extending the vocabulary](#extending-the-vocabulary)
- [Notes](#notes)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
npm install blemish --save
```

## Usage

An issue is either an **item** (a leaf) or a **group** (a node with children). Build both with the factories — never with object literals, which skip the type gatekeep.

```typescript
import { IssueCode, defineIssueGroup, defineIssueItem } from 'blemish';

const issues = [
    defineIssueItem({
        code: IssueCode.REQUIRED,
        path: ['user', 'name'],
        message: 'Name is required',
    }),
    defineIssueGroup({
        code: IssueCode.ONE_OF_FAILED,
        path: ['user', 'contact'],
        message: 'No contact method was valid',
        issues: [
            defineIssueItem({
                code: IssueCode.EMAIL,
                path: ['user', 'contact', 'email'],
                message: 'Not a valid email address',
            }),
            defineIssueItem({
                code: IssueCode.PATTERN,
                path: ['user', 'contact', 'phone'],
                message: 'Not a valid phone number',
                data: { pattern: '^\\+?[0-9]{7,}$' },
            }),
        ],
    }),
];
```

Consume it flat, which is what a form usually wants:

```typescript
import { flattenIssueItems } from 'blemish';

const byField = Object.fromEntries(
    flattenIssueItems(issues).map((item) => [item.path.join('.'), item.message]),
);
// {
//   'user.name':           'Name is required',
//   'user.contact.email':  'Not a valid email address',
//   'user.contact.phone':  'Not a valid phone number',
// }
```

…or walk the tree when the grouping matters — the `ONE_OF_FAILED` group above is the difference between "two fields are broken" and "you needed one of these two".

### Localizing

Issues carry an eager English `message` **and** the structured `data` that produced it, so a consumer can re-render in another locale without the producer knowing any locales:

```typescript
import { formatIssue } from 'blemish';

const de = {
    required: 'Pflichtfeld',
    min_length: 'Mindestens {min} Zeichen',
};

formatIssue(issue, de);        // 'Mindestens 3 Zeichen'
formatIssue(issue);            // falls back to issue.message
formatIssue(issue, de, '—');   // falls back further, if message is empty too
```

The catalog may be partial. A code it does not cover falls back to that issue's own `message`, per issue — not all-or-nothing.

## The absolute-path invariant

**Every node carries its full path from the root, at every depth.** A leaf three groups deep still reads `['user', 'contact', 'email']`, never `['email']` relative to its parent.

This is the one rule the whole model rests on. It is what lets `flattenIssueItems` produce a directly indexable list, and it is why a consumer never has to walk the tree just to find out where something belongs.

The invariant is not automatic — it is maintained by the **producer**. Whenever you validate a sub-structure and merge its issues into a larger tree, the children arrive relative to that sub-structure and must be rebased. That is `prefixIssuePath`:

```typescript
import { prefixIssuePath } from 'blemish';

// validating `address` on its own produced paths like ['street']
const rebased = childIssues.map((issue) => prefixIssuePath(issue, ['user', 'address']));
// → ['user', 'address', 'street'] — at every depth, including inside groups
```

> **The recursion is the point.** Rebasing only the node you were handed passes every shallow test and silently corrupts exactly the nested cases: a child that already wrapped its own failures in a group surfaces inner leaves missing the parent segment, and per-field lookup mis-indexes them. This function is exported so nobody has to rediscover that.

`prefixIssuePath` returns copies and never mutates its input. The copy is shallow, so `data` and `meta` are carried over by reference.

## API

### Factories

| Function | Purpose |
|---|---|
| `defineIssueItem(input)` | Build a leaf. The supplied `code` selects the required `data` shape at compile time. |
| `defineIssueGroup(input)` | Build a node with children. Does **not** rewrite child paths — that is `prefixIssuePath`'s job. |

### Tree operations

| Function | Purpose |
|---|---|
| `prefixIssuePath(issue, prefix)` | Rebase an issue onto a parent path, recursing into groups. Returns copies. |
| `flattenIssueItems(issues)` | Every leaf, pre-order, grouping discarded. Returns live references. |
| `flattenIssueGroups(issues)` | Every group, pre-order, outermost first. Returns live references. |

### Guards

| Function | Purpose |
|---|---|
| `isIssueItem(input)` | Structural check for a leaf. |
| `isIssueGroup(input)` | Structural check for a node with children; recurses. |
| `isIssue(input)` | Either of the above. |

All three are **duck-typed rather than `instanceof`-based**, deliberately: a tree assembled across package or realm boundaries — or from two copies of this package — has no shared class to check against.

### Formatting

| Function | Purpose |
|---|---|
| `formatIssue(issue, templates?, fallback?)` | Render a message: template → eager `message` → fallback. |
| `interpolate(str, data, regex?)` | Substitute `{name}` placeholders. Exported for custom formatters. |

### Types

`Issue`, `IssueItem`, `IssueGroup`, `IssueBase`, `IssueItemTyped`, `IssueItemBare`, `IssueItemRaw`, `IssueCode`, `IssueDataByCode`, `ParameterizedIssueCode`, `BareIssueCode`, `IssueMessageTemplates`, `ResolveIssueCode`.

## Issue codes

`IssueCode` is a **default vocabulary**, not a requirement — see [Extending the vocabulary](#extending-the-vocabulary) if yours differs. Codes marked with a `data` shape require it; the rest must omit it.

| Group | Code | Required `data` |
|---|---|---|
| Generic | `value_invalid`, `one_of_failed` | — |
| Presence | `required` | — |
| Type | `alpha`, `alpha_num`, `numeric`, `integer`, `decimal` | — |
| Length | `min_length` / `max_length` | `{ min }` / `{ max }` |
| Range | `min_value` / `max_value` | `{ min }` / `{ max }` |
| | `between` | `{ min, max }` |
| Format | `email`, `url`, `ip_address`, `mac_address`, `uuid`, `date`, `json`, `base64` | — |
| | `pattern` | `{ pattern }` |
| | `strong_password` | `{ minLength?, minLowercase?, minUppercase?, minNumbers?, minSymbols? }` |
| Comparison | `same_as` | `{ other }` |

The `data` contract is enforced **at the producer**, at compile time:

```typescript
defineIssueItem({ code: IssueCode.MIN_LENGTH, path: ['n'], message: '…' });
//  ✗ compile error — min_length requires data: { min: number }

defineIssueItem({ code: IssueCode.EMAIL, path: ['e'], message: '…', data: { x: 1 } });
//  ✗ compile error — email is a bare code; data must be absent

defineIssueItem({ code: IssueCode.MIN_LENGTH, path: ['n'], message: '…', data: { min: 3 } });
//  ✓
```

That guarantee is what makes a translation catalog safe to write: a template referencing `{min}` cannot meet a `min_length` issue that lacks it.

## Extending the vocabulary

**Your own codes need no coordination.** `IssueItem['code']` is widened to `IssueCode | (string & {})`, so any string is a well-formed code and lands on the open-`data` branch:

```typescript
defineIssueItem({
    code: 'key_not_allowed',
    path: ['filter', 'name'],
    message: 'Key is not allowed',
});
```

If you additionally want the typed `data` gatekeep for your own codes, augment `IssueDataByCode`:

```typescript
declare module 'blemish' {
    interface IssueDataByCode {
        email_taken: { existingUserId: string };
    }
}

defineIssueItem({
    code: 'email_taken',
    path: ['email'],
    message: 'Already in use',
    data: { existingUserId: 'u_42' }, // now typed and required
});
```

The augmentation also reaches **through a re-exporting package**. A library that does `export * from 'blemish'` lets its own consumers write `declare module '<that-library>'`, and the merge still lands here — so `ParameterizedIssueCode` picks the new code up either way.

## Notes

**Narrowing has one known limitation.** `IssueItemRaw`'s `code: string & {}` overlaps the literal codes, so `if (issue.code === IssueCode.MIN_LENGTH) issue.data.min` types as `number | unknown | undefined` rather than `number`. The producer-side gatekeep is the primary safety net; a consumer needing a clean narrow can use `Extract<IssueItem, { code: 'min_length' }>` or cast after the equality check.

**`meta` is deliberately open.** Issues cross library boundaries, and the library that produced one routinely knows things the library rendering it does not. Keys are owned by whoever writes them. The bar worth holding yourself to is *provenance the consumer cannot reconstruct* — not presentation tokens like `severity` (a rendering decision, so it belongs to the renderer) and not facts the caller already supplied.

**`interpolate` carries two inherited properties**, kept so that libraries re-exporting it stay behaviourally identical: a custom `regex` must carry the `g` flag, and `$`-patterns inside a *substituted value* are expanded by `String.prototype.replace` rather than kept literal. Treat `data` values as trusted, or escape `$`.

**Stability.** The exported types, the factory signatures, the `IssueCode` values and the `data` contract per code are semver-protected. The `IssueDataByCode` augmentation point is part of that surface.

## Contributing

Before starting to work on a pull request, it is recommended to open an issue for discussion.

Please make sure to run `npm run test` and `npm run lint` before submitting. Commits follow [Conventional Commits](https://www.conventionalcommits.org).

## License

Made with 💚

Published under [MIT License](./LICENSE).
