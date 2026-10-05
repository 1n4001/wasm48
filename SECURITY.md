# Security policy

## Supported versions

Security fixes are applied on `main` and ship with the GitHub Pages deployment. There are no other supported release lines.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| older commits | No |

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately with [GitHub Security Advisories](https://github.com/1n4001/wasm48/security/advisories/new). Include what you ran, the effect, and whether the Pages deployment is affected.

You should hear back within 7 days. If the report is accepted, the fix will land on `main` before any public write-up. If it is declined, you will get a short explanation.

WASM48 is a client-side calculator. The Pages build does not run a private server and does not store account data. Reports that only affect the local dev sandbox, and not the published calculator, are still welcome if they expose a real bug in this repository.
