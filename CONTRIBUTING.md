# Contributing to Northstar

Thanks for considering a contribution. Northstar is currently an early public beta maintained by a first-time open-source maintainer, so the process is intentionally simple and conservative.

## Before You Start

- For bug reports and small fixes, feel free to open an issue or pull request directly.
- For larger changes, please open an issue first so we can agree on the direction before you spend a lot of time. Every pull request also goes through an automated CLA check (see below).
- By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
- Agents and contributors should also read [AGENTS.md](AGENTS.md) — it is the single source of truth for the project's conventions, invariants, and Git workflow, and is intentionally not duplicated here.
- Do not include personal finance data, real account numbers, API keys, signing keys, screenshots with private information, or production secrets in issues, commits, tests, or pull requests. Northstar is software, not financial advice.
- The project source code is licensed under the **GNU General Public License v3.0 (or later)** — see [LICENSE](LICENSE). Bundled fonts (OFL-1.1) and excluded bank/brand logos are licensed separately — see [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).
- **All pull requests require signing the Contributor License Agreement (CLA).** This is a **one-time** step: the first time you open a PR, a bot comments asking you to sign; reply with the phrase it gives you and you're set for all future PRs. See [CLA.md](CLA.md) for the full text — it keeps the public source under GPLv3 while letting the maintainer preserve future licensing options (e.g. an App-Store build). PRs cannot be merged until the CLA is signed.

## Issues

Useful bug reports usually include:

- macOS / Windows / Linux version
- Northstar version
- What you expected to happen
- What actually happened
- Reproduction steps
- Screenshots or sample data only if they are fully redacted

Feature requests are welcome. Please describe the workflow you are trying to improve, not only the UI you want added.

## Pull Requests

For now, pull requests should stay focused:

- Keep changes small enough to review.
- Add or update tests when changing parsing, calculations, sync, storage, or other domain behavior. Finance math is correctness-first — don't change semantics silently.
- A pull-request template will pre-fill a checklist when you open a PR; the first time you open one, the CLA bot comments asking you to sign (a one-time step — see above).
- Run the relevant checks before opening a PR when possible:

```bash
npm test            # vitest run
npm run lint        # eslint src
npx tsc --noEmit    # type-check (npm run build also runs tsc)
npm run check:tauri # cargo fmt --check && cargo check — only when you touch Rust (src-tauri/)
```

If a check cannot be run locally, mention that in the PR description.

### UI copy

UI strings are **not** hand-edited in `.tsx`. Edit them in `copy.csv`, then round-trip:

```bash
npm run copy:export   # translation.json -> copy.csv
npm run copy:import   # copy.csv -> translation.json
```

## Development Setup

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for local setup, testing, and packaging notes.

## Maintainer Expectations

Issues and pull requests are welcome, but response time may vary. A pull request may be declined if it is too broad, changes the product direction, lacks enough context, or would add maintenance burden before the project is ready for it.
