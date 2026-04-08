# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.6] - 2026-04-07

### Fixed
- Eliminated a race in `initializeClient_` where concurrent cold-start sends each ran the dynamic `mailgun.js` import and constructed a client; the in-flight promise is now memoized and cleared on failure so retries still work (TICKET-4)
- Replaced the regex-based subscriber template scanner with a TypeScript AST walk that correctly handles multi-handler files, no-substitution template literals (backticks), dynamic template expressions, and unrelated `template:` keys on non-notification objects (TICKET-7)
- Removed `subscriber_root` from the admin checklist response type and UI; the absolute filesystem path was never returned by the route and previously rendered `undefined` in the "subscriber directory not found" banner (TICKET-9)
- Checklist rollup no longer reports `pass` for subscribers that couldn't be verified. Subscribers with neither a static template nor inline `html`/`text` now surface as `warn` ("inline body not verified") instead of silently passing as `inline` (TICKET-18)

### Changed
- `SubscriberScanResult` now includes `inline_html_present` and `inline_text_present` flags so the checklist can distinguish verified inline bodies from subscribers with no detectable content
- Added `typescript` to `dependencies` — the checklist scanner now uses the TypeScript compiler API at runtime

### Breaking
- Checklist events that previously reported `inline` with no detectable `html`/`text` will now report `warn`. Projects relying on the old optimistic pass should either add a static `template` name or inline body to their `createNotifications` call.

## [0.2.5] - 2026-04-07

### Fixed
- Moved `form-data` and `mailgun.js` from `peerDependencies` to `dependencies` so host apps don't need to install them (TICKET-12)
- Aligned send-email zod schema with nested `data` shape (TICKET-10)
- Throw on empty notification body instead of leaking serialized DTO to recipients (TICKET-3)

### Security
- Restricted `package.json` exports to explicit subpaths (`.`, `./providers/notification-mailgun`, `./admin`, `./package.json`); removed the `"./*"` wildcard that exposed the entire build tree (TICKET-13)

### Breaking
- Deep imports relying on the previous `"./*"` exports wildcard will no longer resolve. Use the documented `./providers/notification-mailgun` and `./admin` subpaths.

## [0.2.4] - 2026-04-03

### Changed
- Migrated from npm to pnpm as the project package manager
- Added `"packageManager": "pnpm@9.15.4"` to package.json
- Replaced package-lock.json with pnpm-lock.yaml
- Updated CI workflow to use pnpm (pnpm/action-setup@v4)
- Updated documentation to use pnpm commands

## [0.2.3] - 2026-04-02

### Fixed
- Widened peer dependencies to `^2.3.0` to support all Medusa 2.x versions from 2.3 onward
- Import types from `@medusajs/framework/types` instead of `@medusajs/types` to avoid relying on a transitive dependency

## [0.2.2] - 2026-04-02

### Fixed
- Tightened peer deps and cleaned up dependencies
- Added plugin provider configuration example to docs

## [0.2.1] - 2026-04-02

### Fixed
- Updated documentation references from `medusa-notification-mailgun` to scoped `@mdgar/medusa-notification-mailgun`

### Changed
- Added npm version badge and styled header to README

## [0.2.0] - 2026-03-31 — First NPM release

### Added
- Mailgun Admin UI panel with tabbed interface (Send Test, Event Checklist, Documentation)
- Send Test tab: compose and send test emails with template, inline HTML/text, subject, Reply-To, and per-notification sender override
- Event Checklist tab: `GET /admin/mailgun/checklist` endpoint that scans subscriber files and reports which Medusa notification events have Mailgun handlers configured
- Reply-To header support (`reply_to` field on notification data)
- Per-notification sender override (`data.from` field)
- Locale support via Mailgun's `t:version` parameter
- Full test suite (61 tests) covering provider, admin routes, and scan utility
- GitHub Actions CI workflow with secrets scanning via Gitleaks
- Quickstart guide and event wiring documentation

### Security
- Path traversal guard on attachment filenames
- SSRF guard on `region` option (only `"us"` and `"eu"` accepted)
- Attachment size capped at 25 MB
- Template data payload capped at 32 KB
- Symlink traversal guard in `scanSubscribers` (directory and per-file level)
- Admin API errors sanitized with correlation IDs; full errors logged server-side only

### Changed
- Migrated to official Medusa plugin structure (`medusa plugin:build`, `exports` map, `.medusa/` output)
- Upgraded to `mailgun.js` v12 (from v10)
- Lazy Mailgun client initialization (initialized on first send, not at startup)

## [0.1.0] - 2026-03-29 — Initial (unreleased)

Initial implementation of the Mailgun notification provider for MedusaJS v2.

### Added
- `MailgunNotificationProviderService` implementing the Medusa `AbstractNotificationProviderService` interface
- Support for Mailgun template-based sends, inline HTML, and plain-text fallback
- Attachment support
- EU region support
- Basic `validateOptions` with required field checks

[0.2.4]: https://github.com/burden/medusa-notification-mailgun/releases/tag/v0.2.4
[0.2.3]: https://github.com/burden/medusa-notification-mailgun/releases/tag/v0.2.3
[0.2.2]: https://github.com/burden/medusa-notification-mailgun/releases/tag/v0.2.2
[0.2.1]: https://github.com/burden/medusa-notification-mailgun/releases/tag/v0.2.1
[0.2.0]: https://github.com/burden/medusa-notification-mailgun/releases/tag/v0.2.0
