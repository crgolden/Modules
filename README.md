[![Publish](https://github.com/crgolden/Modules/actions/workflows/publish.yml/badge.svg)](https://github.com/crgolden/Modules/actions/workflows/publish.yml)

[![Quality gate](https://sonarcloud.io/api/project_badges/quality_gate?project=crgolden_Modules)](https://sonarcloud.io/summary/new_code?id=crgolden_Modules)

# Modules

TypeScript modules published together as one npm package, `@crgolden/modules`, to the `crgolden` GitHub Packages
feed. Each module is a subpath of the package:

```ts
import { walk } from '@crgolden/modules/synthetic-walker';
```

How the modules are built and the rules each keeps: [ARCHITECTURE.md](ARCHITECTURE.md). How to run the tests:
[TESTING.md](TESTING.md).

## Modules

| Module | What it is |
|---|---|
| `angular` | Angular providers for server-rendered apps: `provideBrowserScrollRestorationWhenLeavingTheDocument`, which lets Back restore the reader's position after a click that left the document before hydration; compiled by Angular's compiler in partial mode |
| `server-startup` | `startOnceRetryingFailures`: a Node server starts its Express app once and shares it, and a start that fails is forgotten so the next request retries rather than failing until a restart |
| `scroll-restoration` | The framework-free half of that provider: the `history.scrollRestoration` modes, the `beforeunload` event name and the hand-back logic, importable from Node (a Playwright spec) without loading Angular; published as an ES module for bundlers and CommonJS for `require` |
| `primitives` | Angular directives (buttons, card, page container, page section) that style their host element with Tailwind utilities from the consuming app's `@theme` tokens; compiled by Angular's compiler in partial mode |
| `design-gates` | Design checks for Angular apps: every template and host class must reach CSS the build ships (a mistyped Tailwind utility compiles to nothing), every z-index utility must read a `--z-*` token, every `@theme` token must be read, plus a stylelint config for what `@layer base` may say. The `check-design-utilities` command runs the check from an app's root |
| `npm-audit` | The `check-npm-audit` command: runs `npm audit --json` in the package it is started in and fails on any high or critical advisory, reporting moderate and lower without failing. An advisory is excepted only by an entry in that package's `npm-audit-exceptions.json` naming its advisory id, the direct dependencies it arrives through, an expiry and a reason; the same advisory through any other dependency, an expired entry, an entry matching nothing, a report npm could not produce, and a project file up to the repository root setting `ShouldRunNpmAudit` to false all fail |
| `synthetic-walker` | Seeded random-walk engine for scheduled synthetic-user Playwright tests: a deterministic PRNG, a weighted action-graph walker, id-prefix locator helpers, and a passkey sign-in flow |
| `bdd-results` | Turns a Gherkin E2E run's Cucumber Messages NDJSON (from `playwright-bdd` or Reqnroll) into one result per scenario and per step and inserts them into PostgreSQL; the `publish-bdd-results` command |
| `testing` | Test-data generators: crypto-backed tokens, ids, counts, set members, addresses and instants, so no test spells a specimen value |

## Technologies

- TypeScript 6, compiled by `tsc` to CommonJS (and an ES-module build of `scroll-restoration`), and by Angular's
  `ngc` for `primitives` and `angular`.
- Node's built-in test runner (`node --test`) with `c8` coverage.
- ESLint with the SonarJS, unicorn and import-x plugins; SonarCloud in CI.
- One runtime dependency, `pg`; Angular, RxJS, Playwright, ESLint and Tailwind CSS are optional peer dependencies,
  each needed only by the module that imports it.

## Prerequisites

- Node.js 24 (`.nvmrc`) and the npm that ships with it.
- Nothing else for installing, building and testing: every dependency comes from the public npm registry.

## Clone, install and build

```powershell
git clone https://github.com/crgolden/Modules.git
cd Modules
npm ci
npm run build
```

## Configuration

Building and testing read no configuration and need no secrets. Some modules read environment variables when a
consuming app runs them:

| Module | Variables |
|---|---|
| `bdd-results` | PostgreSQL's standard `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSLMODE`, and GitHub Actions' `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `GITHUB_SERVER_URL`, `GITHUB_REPOSITORY`, `GITHUB_SHA`, `GITHUB_REF`, `GITHUB_EVENT_NAME`; a missing one fails the command by name |
| `synthetic-walker` | `SYNTHETIC_SEED`, `SYNTHETIC_STEPS`, and `PASSKEY_CREDENTIAL<n>` for the signed-in slots |

## Run locally

There is no application to run. The package's three commands run from a consuming project once it is installed:
`check-design-utilities`, `check-npm-audit` and `publish-bdd-results`. In this repo, `npm run audit` runs the audit
command from the local build.

## Tests

```powershell
npm run build
npm test
```

`npm test` must follow `npm run build`: one test loads the built `scroll-restoration` files. The tests need no network,
database or secrets. [TESTING.md](TESTING.md) lists what each test covers.

## Gate

`gate.ps1` is the maintainers' gate. It loads a private toolkit from a folder beside this repo, so in a plain clone it
stops at once with `GATE: FAILED`. To gate your own change, run the checks CI runs, in this order:

```powershell
npm ci
npm run lint
npm run build
npm run audit
npm test
```

## Publishing

Push to `main`. The publish workflow lints, builds, audits and tests the package, then publishes it when the version
in `package.json` is not yet on the registry; bump the version in the same change as the code it describes. A push
whose version is already published builds but publishes nothing.

## Consuming

GitHub Packages requires a token to install even a public package. A consuming project carries a `.npmrc` with
`@crgolden:registry=https://npm.pkg.github.com`, and the token comes from the environment: in CI through
`actions/setup-node`'s `registry-url` and a `NODE_AUTH_TOKEN` with `read:packages`, locally through a personal access
token in your user `~/.npmrc`:

```
//npm.pkg.github.com/:_authToken=<PAT with read:packages>
```

A consumer that imports `primitives` must point Tailwind at the package
(`@source "../node_modules/@crgolden/modules";` in its stylesheet), because Tailwind skips `node_modules` by default;
without it the build succeeds and the directives render unstyled.
