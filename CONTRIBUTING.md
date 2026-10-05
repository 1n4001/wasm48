# Contributing to WASM48

Thanks for helping. Bug fixes, function coverage, and clearer stack results are all welcome.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

Requirements: Node.js 22.

```bash
git clone https://github.com/1n4001/wasm48.git
cd wasm48
npm ci
npm run dev
```

Open the app on port 8080. The GitHub Pages build is separate:

```bash
npm run build:pages
```

## Checks

Run these before you open a pull request:

```bash
npm test
node --experimental-strip-types --test src/lib/calc/matlab.test.ts src/lib/calc/session.test.ts src/lib/calc/mathml.test.ts
npm run typecheck
```

`npm run lint` should stay clean on files you touch.

Calculator behavior belongs in `src/lib/calc/`. Add or extend a test next to the change. A new function also needs a row in `src/lib/calc/library.ts` so it shows up in the reference table.

## Pull requests

1. Fork the repo and branch from `main`.
2. Keep the change focused. A bug fix does not need a drive-by refactor.
3. Describe the input you tried and the stack result you expect.
4. Do not commit `node_modules`, build output, or local environment files.

## Reporting bugs

Use the [bug report](https://github.com/1n4001/wasm48/issues/new?template=bug_report.yml) template. Include the script that failed and what the LCD showed.

Security issues go through [SECURITY.md](SECURITY.md), not a public issue.
