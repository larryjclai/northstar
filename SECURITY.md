# Security Policy

Northstar is an early beta personal finance app. Please assume security-sensitive reports may contain private financial context and avoid posting exploit details publicly.

## Supported Versions

Only the latest release is currently supported for security fixes.

## Reporting a Vulnerability

Please do not open a public issue with full vulnerability details.

Preferred flow:

1. Use GitHub's private vulnerability reporting for this repository if it is enabled.
2. If private reporting is not enabled yet, open a minimal public issue titled `Security report` without exploit details, secrets, screenshots, or private data. The maintainer will arrange a private channel.

Please include, privately when possible:

- Affected version or commit
- Impact and attack scenario
- Reproduction steps
- Whether user data, local files, sync data, update signing, or release artifacts are affected

## Scope

Especially relevant areas:

- Local SQLite storage and exports
- Optional sync, pairing, encrypted envelopes, and device management
- Release signing, update feeds, and installer artifacts
- File import/export flows
- Any path that could expose personal finance data

## Current Beta Notice

The app is not yet fully security reviewed. macOS builds may be unsigned or not notarized until an Apple Developer account is available. Public source review improves transparency, but it is not a guarantee that the app is free of vulnerabilities or malware.
