/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IssueCode } from './constants';
import type { Issue } from './types';

/**
 * Substitute `{name}` placeholders in `str` with values from `data`.
 *
 * Placeholders whose key is missing from `data` (or explicitly
 * `undefined`) are left in the string verbatim, so a partially-populated
 * `data` degrades to a readable template rather than to `"undefined"`.
 *
 * Two properties are inherited from the `@ebec/core` implementation this
 * replaces, and are kept deliberately so that libraries which re-export
 * either function stay behaviourally identical:
 *
 * - `regex` must carry the `g` flag — `String.prototype.matchAll` throws
 *   without it.
 * - Substitution goes through `String.prototype.replace` with a string
 *   replacement, so `$&`, `` $` ``, `$'` and `$1` inside a *substituted
 *   value* are interpreted as replacement patterns rather than literals.
 *   Treat `data` values as trusted, or escape `$` before passing them.
 */
export function interpolate(
    str: string,
    data: Record<string, unknown>,
    regex: RegExp = /\{(\w+)\}/g,
): string {
    return Array.from(str.matchAll(regex)).reduce((acc, match) => {
        const key = match[1];
        if (key && typeof data[key] !== 'undefined') {
            return acc.replace(match[0], String(data[key]));
        }
        return acc;
    }, str);
}

/**
 * Map of issue `code` → message template. Templates use `{name}`
 * placeholders — the syntax {@link interpolate} understands — and are
 * resolved against `Issue.data` at format time.
 *
 * ```ts
 * const de: IssueMessageTemplates = {
 *     value_invalid: 'Wert ist ungültig',
 *     min_length: 'Mindestens {min} Zeichen',
 *     one_of_failed: 'Keine der Varianten war erfolgreich',
 * };
 * ```
 */
export type IssueMessageTemplates = Partial<Record<IssueCode, string>> & Record<string, string>;

/**
 * Render an issue's user-facing message.
 *
 * Resolution order:
 * 1. If `templates[code]` exists, return `interpolate(template, issue.data)`.
 * 2. Else return `issue.message` (the default English rendering set at
 *    construction time).
 * 3. Else return `fallback`.
 *
 * The eager `message` written at construction time is what makes step 2
 * useful: a consumer with no catalog at all still gets something readable,
 * and a consumer with a partial catalog falls back per-code rather than
 * all-or-nothing.
 */
export function formatIssue(
    issue: Issue,
    templates?: IssueMessageTemplates,
    fallback: string = '',
): string {
    if (templates && issue.code) {
        const template = templates[issue.code];
        if (typeof template === 'string') {
            return interpolate(template, issue.data || {});
        }
    }

    if (typeof issue.message === 'string' && issue.message.length > 0) {
        return issue.message;
    }

    return fallback;
}
