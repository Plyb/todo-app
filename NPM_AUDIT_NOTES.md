# npm warnings audit (#60)

## Security advisories: none

`npm audit` and `npm audit --json` report **0 vulnerabilities** (info/low/moderate/high/critical
all 0) across all 412 resolved dependencies. `npm audit fix` and `npm audit fix --force` both
confirm there is nothing to fix.

## Deprecation warnings: 2, both unfixable without a risky, unnecessary change

`npm install` prints two `npm warn deprecated` lines. Neither corresponds to an audit
advisory — they are the packages' own "please upgrade" nags, not CVEs.

```
npm warn deprecated source-map@0.8.0-beta.0: The work that was done in this beta branch won't be included in future versions
npm warn deprecated glob@11.1.0: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version.
```

Both come from the same place:

```
vite-plugin-pwa@0.21.2 -> workbox-build@7.4.1 -> glob@11.1.0
vite-plugin-pwa@0.21.2 -> workbox-build@7.4.1 -> source-map@0.8.0-beta.0
```

`workbox-build@7.4.1` is the **latest published version** of `workbox-build`, and it directly
pins `glob: "^11.0.1"` and `source-map: "^0.8.0-beta.0"` in its own `package.json`. There is no
newer `workbox-build` release that updates these pins. Bumping `vite-plugin-pwa` to its latest
major (1.3.0) doesn't help either — it still depends on `workbox-build: "^7.4.1"`, so the same
transitive versions get resolved.

Why this is acceptable to leave as-is:

- `npm audit` already shows 0 vulnerabilities for this dependency tree, so there is no known
  advisory being ignored — these are purely "this old release is deprecated, please upgrade"
  notices, not security reports.
- `glob` and `source-map` here are internal implementation details of `workbox-build`, used only
  at build time to generate the PWA precache manifest/service worker (`npm run build`). They are
  never bundled into the app or reachable from application/runtime code.
- The only way to silence the warnings would be to force an `overrides` entry pinning `glob` to a
  newer major (11 -> 13) or `source-map` to a stable 0.7.x release underneath `workbox-build`,
  which `workbox-build` has never been tested against. That risks silently breaking the
  production build (PWA asset precaching) to suppress a cosmetic warning with no corresponding
  vulnerability — not a reasonable trade.

## `pulltorefreshjs` (github:BoxFactura/pulltorefresh.js)

Investigated per the issue's suggestion since it's installed from a GitHub source rather than
the npm registry. Findings:

- It produces **no** deprecation warning and **no** audit finding on install.
- An npm-registry package of the same name (`pulltorefreshjs`) does exist, published by
  `pateketrueke`, but its latest release (`0.1.22`) has been unchanged since **2021-02-26** —
  over 5 years stale. The GitHub repo (`BoxFactura/pulltorefresh.js`), which is what this project
  actually depends on, was last pushed **2025-09-24** and is the actively maintained source.
- Comparing the built `dist/index.js` from the npm tarball against the one currently installed
  from GitHub shows only cosmetic transpilation differences (comment placement, arrow-function
  vs. function-expression output) — no functional divergence — but the GitHub source is the
  fresher, maintained one.
- Switching to the npm-registry release would be a downgrade in freshness for no benefit (it
  isn't the source of any warning), so it was left unchanged. This also matches the git history:
  the project previously depended on a different npm package (`pulltorefresh@0.1.1` by
  SimonWaldherr) and was deliberately switched to this GitHub-sourced fork because the npm one
  was broken (missing a resolvable `main` field for Vite) — see commit `aaf3453`.

## Outdated (but not warned-about / not deprecated) packages

`npm outdated` shows a few packages with newer majors available (`vite-plugin-pwa` 0.21.2 ->
1.3.0, `vite` 6.4.3 -> 8.1.4, `typescript` 5.6.3 -> 7.0.2, `@vitejs/plugin-react` 4.7.0 -> 6.0.3).
These are ordinary version-lag, not deprecation or security warnings, and issue #60 is scoped to
warnings/advisories — so per the "no speculative dependency bumps" guidance these were left alone.

## Summary

No code or dependency changes were needed: `npm audit` is already clean, and the two deprecation
warnings are cosmetic nags from a third-party build tool's own pinned transitive dependencies,
with no newer upstream release and no reachable security impact on this app.
