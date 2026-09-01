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
| `synthetic-walker` | Seeded random-walk engine for scheduled synthetic-user Playwright tests: a deterministic PRNG, a weighted action-graph walker, id-prefix locator helpers, and the marked synthetic login flow |

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
