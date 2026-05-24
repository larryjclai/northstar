# Northstar

Northstar is a local-first, privacy-first personal and household finance app for investors who want calm portfolio tracking without handing readable financial data to a cloud service.

This branch is the Tauri rebuild. The previous SwiftUI / SwiftData implementation is preserved on GitHub at:

```bash
archive/swift-native-before-tauri
```

## Stack

- Tauri 2 for desktop and mobile packaging
- React + TypeScript + Vite
- Tailwind CSS v4
- Base UI primitives
- Phosphor Icons
- TanStack Router, Query, and Table
- Zustand, React Hook Form, Zod
- Recharts
- SQLite through the Tauri SQL plugin
- Stronghold for vault-key storage
- Supabase for optional Connect sync infrastructure

## Development

```bash
npm install
npm run dev
npm run build
npm test
```

Tauri commands are available through:

```bash
npm run tauri dev
```

## Product Shape

Northstar starts local-only. No account is required for the core app.

Connect is optional and unlocks encrypted sync, trusted-device pairing, household sharing, encrypted attachment backup, and future broker/market-data integrations. Connect requires a confirmed Recovery Kit before any cloud-backed feature starts.

## Architecture Docs

- [Product spec](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Roadmap](ROADMAP.md)

