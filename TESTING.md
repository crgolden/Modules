# Testing

## Test tiers

One tier: unit tests on Node's built-in runner. `npm test` compiles `src` with `tsconfig.test.json` to `dist-test/`,
then runs every test file the `test` script in `package.json` names under `c8`. A new test file runs only once it is
added to that list. The tests use no network, database or secret: `bdd-results` writes to a recording client, and
`synthetic-walker`'s helpers run against a stub page.

| Test file | Covers |
|---|---|
| `src/eslint-angular/rules.test.ts` | the three ESLint rules, each arm with fixtures that must report and must not |
| `src/synthetic-walker/*.test.ts` | id-prefix picking, credential slots, walk configuration |
| `src/testing/testing.test.ts` | the generators' shapes and ranges |
| `src/design-gates/design-gates.test.ts`, `cli.test.ts` | the design checks, and the command run as a child process in a temporary app |
| `src/scroll-restoration/scroll-restoration.test.ts` | the hand-back logic, and that both built entries load in their own format |
| `src/server-startup/server-startup.test.ts` | one start for many callers, and a retry after a failed start |
| `src/bdd-results/*.test.ts` | message parsing, the inserts, and a recorded Reqnroll run (`recorded/`) |
| `src/npm-audit/*.test.ts` | exceptions, expiry, unmatched entries and the project-file check |

Signing in through a real login page cannot be tested here: it waits on the page's passkey autofill, which only a
scheduled walk against a deployed app exercises.

## Running tests locally

```powershell
npm ci
npm run build
npm test
```

`npm test` must run after `npm run build`, because `scroll-restoration.test.ts` loads the built files. Coverage lands in
`coverage/` (`lcov.info` plus a text summary).

## CI pipeline

`.github/workflows/publish.yml` runs on every push to `main`, every pull request and on demand: `npm ci
--ignore-scripts`, `npm run lint`, `npm run build`, `npm run audit`, `npm test`, a SonarCloud analysis with the quality
gate waited, and a step that fails while SonarCloud reports any open issue. The two SonarCloud steps skip Dependabot's
pull requests, which get no secrets. Publishing runs last, never on a pull request.

## Local SonarCloud analysis

The analysis needs the repo's SonarCloud token and project, which only maintainers have. SonarCloud treats
`**/*.test.ts` as test code, so a test file must hold test cases its JavaScript analyzer recognizes.
