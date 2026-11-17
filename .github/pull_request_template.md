## What changed

<!-- What does this pull request do, and why? Link the issue if there is one: "Closes #..." -->

## How I tested it

<!-- Unit tests, and if you deployed it: which workspace and Commerce instance (SaaS or PaaS, version), and which methods and carts you tried. -->

## Checklist

- [ ] `npm run code:check`, `npm run typecheck` and `npm test` pass
- [ ] New logic in the engine or `src/common/rates` has unit tests
- [ ] The webhook still verifies signatures, and a verified request still never breaks checkout (fallback rate or no rates on error)
- [ ] No secrets, tokens or shopper addresses in code, logs or tests
- [ ] README, `docs/` or CHANGELOG updated, if behaviour, method or row fields, or setup changed
