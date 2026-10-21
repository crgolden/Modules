# Architecture

## Bird's-eye view

One npm package, `@crgolden/modules`, built from one folder per module under `src/`. Each folder's `index.ts` is a
subpath of the package (`@crgolden/modules/<module>`); three modules also ship a command. There is one version for the
whole package.

## Codemap

| Part | What it does |
|---|---|
| `src/<module>/index.ts` | each module's public surface; the modules are listed in README.md |
| `src/design-gates/cli.ts`, `src/npm-audit/cli.ts`, `src/bdd-results/cli.ts` | the `check-design-utilities`, `check-npm-audit` and `publish-bdd-results` commands (`bin` in `package.json`) |
| `src/synthetic-walker/enroll-passkey.ts` | a headed script, not an export, that enrolls a passkey and prints the credential a walk signs in with; refuses to run when `CI` is set |
| `src/bdd-results/recorded/` | recorded Reqnroll runs the tests read; never published |
| `scripts/mark-esm-output.mjs` | writes `dist/esm/package.json` with `"type": "module"`, so Node loads the ES-module build as ES modules |
| `tsconfig.json` | CommonJS build of everything except `primitives` and `angular`, excluding tests and recorded fixtures |
| `tsconfig.primitives.json` | `ngc` build of `primitives` and `angular` in partial-Ivy form, which the consuming app's Angular build links |
| `tsconfig.esm.json` | the ES-module build of `scroll-restoration` |
| `tsconfig.test.json` | compiles sources and tests to `dist-test/` for `npm test` |
| `eslint.config.js`, `eslint-sonar.config.cjs`, `eslint-sonar.rules.json` | `npm run lint`: SonarCloud's rules run locally |
| `.github/workflows/publish.yml` | lint, build, audit, test, analyze, then publish a new version |
| `gate.ps1` | the maintainers' local gate (README.md, "Gate") |

## Invariants

- **Adding a module is adding a folder.** The wildcard `exports` and `typesVersions` maps expose every `src/<module>`;
  only a module that ships tests needs a manifest edit (its test file in the `test` script).
- **The build order is fixed: `ngc`, then `tsc`, then the ES-module build, then `mark-esm-output.mjs`.** `angular`
  imports `scroll-restoration` by the package's own name, so `ngc` also emits that core as an ES module; `tsc` must run
  after it to write the CommonJS copy last. `scroll-restoration.test.ts` fails if either entry loads in the wrong format.
- **`scroll-restoration` ships in both formats**: its `exports` entry sends `import` to `dist/esm/scroll-restoration`
  and `default` to the CommonJS build.
- **Peer dependencies are optional and ranged.** npm never installs an optional peer, so an app that imports a module
  lists the framework itself; an app outside a peer range fails `npm ci` with `ERESOLVE`.
- **`primitives` names theme tokens, never values.** Each directive's host class is one literal list of Tailwind
  utilities, and each consuming app defines the tokens in its own `@theme`.
- **`bdd-results` fails closed.** A finish without its start, a line that is not JSON, or a successful run with no
  finished scenario throws rather than dropping or inventing a row; inserts are plain `INSERT`s in one transaction.
- **Only `dist/` is published** (`files` in `package.json`), and `tsconfig.json` keeps tests and recorded fixtures out
  of it.

## Boundaries

- Installing, building and testing need only the public npm registry. Publishing needs the workflow's
  `GITHUB_TOKEN` with `packages: write`.
- At run time `bdd-results` talks to PostgreSQL through `pg` and the standard libpq variables; `synthetic-walker`
  drives a browser through Playwright and the Chrome DevTools Protocol; `npm-audit` runs the npm that launched it.

## Cross-cutting concerns

- **Lint is SonarCloud's rule set**, generated into `eslint-sonar.config.cjs`, so a local `npm run lint` and the
  SonarCloud analysis agree.
- **The audit is the package's own `check-npm-audit`**, run from the local build (`npm run audit`), and fails on a high
  or critical advisory.
- **A forgotten version bump publishes nothing**: the workflow reports the version as already published and consumers
  keep the old code.
