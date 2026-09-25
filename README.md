# Modules

Shared TypeScript modules for the crgolden fleet, published together as one npm package,
`@crgolden/modules`, to the crgolden GitHub Packages feed — the npm counterpart of the
[Shared](https://github.com/crgolden/Shared) NuGet package.

## Layout

One package, one subpath export per module. Each module is a folder under `src/` with an
`index.ts`; the package's wildcard `exports` map exposes it automatically, so adding a module is
adding a folder — no manifest or workflow edits.

```
import { walk } from '@crgolden/modules/synthetic-walker';
```

## Modules

| Module | What it is |
|---|---|
| `angular` | Angular providers the server-rendered apps share: `provideBrowserScrollRestorationWhenLeavingTheDocument`, which lets Back restore the reader's position after a click that left the document before hydration; compiled by Angular's compiler in partial mode |
| `scroll-restoration` | The framework-free half of that provider: the `history.scrollRestoration` modes, the `beforeunload` event name and the hand-back logic, importable from Node (a Playwright spec) without loading Angular |
| `primitives` | Shared Angular directives (buttons, card, page container, page section) that style their host element with Tailwind utilities from the consuming app's `@theme` tokens; compiled by Angular's compiler in partial mode |
| `design-gates` | The Angular apps' design checks: every template and host class must reach CSS the build ships (a mistyped Tailwind utility compiles to nothing), every z-index utility must read a `--z-*` token, every `@theme` token must be read, plus the shared stylelint config for what `@layer base` may say |
| `synthetic-walker` | Seeded random-walk engine for scheduled synthetic-user Playwright tests: a deterministic PRNG, a weighted action-graph walker, id-prefix locator helpers, and the marked synthetic login flow |
| `testing` | The fleet's one TypeScript test-data generator, the counterpart of `Shared.Testing.Generated`: crypto-backed tokens, ids, counts, set members, addresses and instants, so no test spells a specimen value |

## Publishing

Push to `main`. The publish workflow builds the package and publishes it when
`package.json`'s version is not yet on the registry; bump the version in the same change as the
code it describes. A push with an already-published version builds but publishes nothing.

## Consuming

Installs from GitHub Packages require authentication even though the package is public. A
consuming repo carries a `.npmrc` with `@crgolden:registry=https://npm.pkg.github.com`; the
token comes from the environment — in CI via `actions/setup-node`'s `registry-url` plus a
`NODE_AUTH_TOKEN` with `read:packages`, locally via a personal access token in your user
`~/.npmrc`:

```
//npm.pkg.github.com/:_authToken=<PAT with read:packages>
```
