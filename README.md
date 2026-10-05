# WASM48

WASM48 is a browser calculator with an HP-48 style stack and a MATLAB-like command line. Formulas render as MathML. Numeric linear algebra runs in a small WebAssembly BLAS module.

Try it at [1n4001.github.io/wasm48](https://1n4001.github.io/wasm48/).

## What it does

- Reverse Polish stack, plus a script line you can compile and push (`Ctrl+Enter`). `Ctrl+D` drops the top level.
- MATLAB-style arithmetic, matrices, and elementwise operators. Matrix products use DGEMM from the `matrixmultiply` crate, compiled to WASM.
- Named functions such as `f(t) = 1/2*a*t^2+v*t+p`, derivatives with `f'(t)` or `diff`, and integrals with `integ` (indefinite or definite).
- Symbolic placeholders via `syms`, removal via `clear`, and linear systems via `solve`.
- 2D and 3D plots, bitwise shifts and masks, and hex/binary conversions.
- A searchable function list covering elementary functions, special functions, statistics, probability, and a physics set.

## Language notes

```matlab
syms a v p
fp(t) = 1/2*a*t^2+v*t+p
fv(t) = fp'(t)
a = 9.8
v = 0
p = 100
fp(t)
```

`stk(1)` is the newest stack entry. Click a stack level number to copy that value back as script text (`sqrt` instead of a radical, and so on).

## Develop

Requirements: Node.js 22.

```bash
npm ci
npm run dev
```

The dev server listens on port 8080.

```bash
npm test
node --experimental-strip-types --test src/lib/calc/matlab.test.ts src/lib/calc/session.test.ts
npm run typecheck
npm run lint
```

The GitHub Pages build is `npm run build:pages`. Pushes to `main` deploy it with [`.github/workflows/pages.yml`](.github/workflows/pages.yml). The site base path is `/wasm48/`.

The WASM module checked in at `src/lib/calc/blas.wasm` is built from [`native/caliber-blas`](native/caliber-blas) for `wasm32-unknown-unknown`.

## Project layout

| Path | Role |
| --- | --- |
| `src/components/calculator.tsx` | Calculator UI |
| `src/lib/calc/matlab.ts` | Parser, compiler, and script runner |
| `src/lib/calc/calculus.ts` | Derivatives, integrals, simplification, linear solve |
| `src/lib/calc/engine.ts` | Stack machine and elementwise ops |
| `src/lib/calc/library.ts` | Function reference and host math |
| `pages/` | Static app used for GitHub Pages |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). This project is licensed under the [MIT License](LICENSE).
