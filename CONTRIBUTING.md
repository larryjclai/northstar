# Contributing to Northstar

Thanks for considering a contribution. Northstar is currently an early public beta maintained by a first-time open-source maintainer, so the process is intentionally simple and conservative.

## Before You Start

- For bug reports and small fixes, feel free to open an issue or pull request directly.
- For larger changes, please open an issue first so we can agree on the direction before you spend a lot of time.
- Do not include personal finance data, real account numbers, API keys, signing keys, screenshots with private information, or production secrets in issues, commits, tests, or pull requests.
- The project source code is licensed under the [MIT License](LICENSE). By submitting a contribution you agree that it is provided under the same MIT terms. Note that bundled fonts (OFL-1.1) and excluded bank/brand logos are licensed separately — see [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).

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
- Add or update tests when changing parsing, calculations, sync, storage, or other domain behavior.
- Run the relevant checks before opening a PR when possible:

```bash
npm test
npm run build
npm run check:tauri
```

If a check cannot be run locally, mention that in the PR description.

## Development Setup

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for local setup, testing, and packaging notes.

## Maintainer Expectations

Issues and pull requests are welcome, but response time may vary. A pull request may be declined if it is too broad, changes the product direction, lacks enough context, or would add maintenance burden before the project is ready for it.
