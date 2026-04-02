# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.1]: https://github.com/burden/medusa-notification-mailgun/releases/tag/v0.2.1
[0.2.0]: https://github.com/burden/medusa-notification-mailgun/releases/tag/v0.2.0
