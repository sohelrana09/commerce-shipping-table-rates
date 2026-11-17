# Contributing to Shipping Table Rates

Bug fixes, new conditions, pricing options and better documentation are all welcome. For larger changes, open an issue first so we can agree on the approach.

## Getting set up

Follow the [Quick start](README.md#quick-start): you need Node.js 24. The unit tests need no Adobe account, because the database, Commerce, webhook signatures and I/O Runtime are faked:

```bash
git clone https://github.com/sohelrana09/commerce-shipping-table-rates.git
cd commerce-shipping-table-rates
npm install
npm test
```

`npm run admin:preview` runs the Admin page at http://localhost:4344/preview.html with methods kept in the browser. To deploy your copy, follow [docs/installation.md](docs/installation.md): you need an App Builder project, and a Commerce instance in the same Adobe organization to install it on.

## Making a change

1. Fork the repository and create a branch: `git checkout -b feature/your-change`.
2. Follow the [project structure](README.md#project-structure):
   - pricing logic lives in `src/common/rates/engine.js`: one dependency-free module, with unit tests, that the webhook, the Admin actions and the Admin page all import as `#engine`. Keep it free of DOM and Node APIs, and update `engine.d.ts` with it;
   - server-only logic goes in `src/common/rates`; actions stay thin: read the request, call `src/common`, answer;
   - checkout comes first: once a webhook request is verified, no error may escape it. Return the fallback rate or `[{ "op": "success" }]` and log the error;
   - the webhook must keep verifying signatures. Never add a way to skip it.
3. Keep secrets on the server: never log credentials, tokens, public keys or shopper addresses, and never commit `.env` or `.aio`.
4. Run the checks:

   ```bash
   npm run code:check
   npm run typecheck
   npm test
   ```

   Plus `npm run admin:preview` for anything on the Admin page. Coverage must stay at or above 90%.

5. Update the README, the guides in `docs/` and the [CHANGELOG](CHANGELOG.md) when behaviour, method or row fields, or setup change.
6. Commit, push the branch and open a pull request that says what changed and how you tested it. If you tried it on a Commerce instance, say which (SaaS or PaaS, and the version).

## Adding a row condition

1. Read the value in `normaliseRateRequest` and check it in `rowMismatch` in `src/common/rates/engine.js`, returning a short reason name when it fails. Validate it in `validateRow`.
2. Add the field to `RateRow` in `engine.d.ts`, a column to `COLUMNS` in `src/common/rates/csv.js`, a field to `components/row-editor.tsx` and a label to `MISS_LABELS` in `lib/methods.ts`.
3. Add tests, and document it in [docs/rate-tables.md](docs/rate-tables.md).

## Reporting bugs and security issues

- Bugs and ideas: [open an issue](https://github.com/sohelrana09/commerce-shipping-table-rates/issues/new/choose).
- Security problems: report them privately, see [SECURITY.md](SECURITY.md).

By contributing you agree to follow the [code of conduct](CODE_OF_CONDUCT.md), and that your contribution is licensed under the [MIT License](LICENSE).
