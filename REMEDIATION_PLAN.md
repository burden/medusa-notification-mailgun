# Mailgun Plugin Remediation Plan

18 issues, 18 tickets, sequenced. Backend Architect specs paired with PM tickets below.

---

## Sprint 1 — Bleeding (P0/P1: correctness & security)

### TICKET-3 · Stop sending JSON.stringify payload as email body — **P0/S/bug**
- **Root cause:** Missing template/html/text falls through to `JSON.stringify(data, null, 2)` as the body (`service.ts:128`).
- **Fix:** Throw `MedusaError.INVALID_DATA` on empty body. Never serialize internal DTOs to customers. Add unit test for the no-content path.
- **AC:** missing content errors; no raw DTO ever sent; test covers it.
- **Risk:** Med — flips previously "succeeding" sends into errors that surface in retry/queue.

### TICKET-10 · Align zod schema with nested `data.locale` — **P0/XS/bug**
- **Root cause:** `middlewares.ts:11` validates `Record<string,string>`; `service.ts:118` reads `data.locale` (nested).
- **Fix:** `z.object({ locale: z.string().optional(), variables: z.record(z.unknown()).optional() }).passthrough()`. Update service to read typed shape.
- **Risk:** Med — wire-format change; document in changelog.

### TICKET-12 · Move `form-data` & `mailgun.js` to dependencies — **P0/XS/bug**
- **Root cause:** Listed as peerDependencies (`package.json:40-41`); host can't reasonably provide them.
- **Fix:** Move both to `dependencies` with caret ranges. Keep `@medusajs/framework` as the only peer.
- **Risk:** Low.

### TICKET-4 · Fix race in `initializeClient_` — **P1/S/bug**
- **Root cause:** Concurrent `send()` on cold start each runs the dynamic import (`service.ts:56-74`).
- **Fix:** `private clientPromise_?: Promise<IMailgunClient>; return this.clientPromise_ ??= (async()=>{...})()`. Clear on failure for retry.
- **Risk:** Low — testable with `Promise.all`.

### TICKET-7 · Replace regex template scanner with TS AST — **P1/M/bug**
- **Root cause:** `scan.ts:69` grabs first `template:` literal; misses template literals, multi-handler files, unrelated keys.
- **Fix:** `ts.createSourceFile`, walk default-export call expressions, read `template` property values. Fixtures for multi-handler + template-literal cases.
- **Risk:** Med — checklist accuracy depends on it; gate on tests.

### TICKET-9 · Reconcile `subscriber_root` across API/UI — **P1/XS/bug**
- **Root cause:** Declared in `page.tsx:43`, rendered at `page.tsx:472`, omitted by `route.ts:120`.
- **Fix:** Either compute and return it from the route, or drop it from `ChecklistResponse` and the component. Pick one.
- **Risk:** Low — closed admin loop.

### TICKET-13 · Restrict `package.json` exports wildcard — **P1/XS/security**
- **Root cause:** `"./*": "./.medusa/server/src/*.js"` exposes the entire build tree.
- **Fix:** Explicit subpaths only (`"."`, `"./providers/notification-mailgun"`). Verify with `pnpm pack` into a sample app.
- **Risk:** Med — packaging change.

### TICKET-18 · Verify inline-status rollup before reporting `pass` — **P1/S/bug**
- **Root cause:** `route.ts:104-113` marks 100% inline subscribers `pass` without validating content.
- **Fix:** Scanner returns `{template?, inlineHtml?, inlineText?}`. Rollup requires resolvable template OR non-empty html/text; otherwise `warn: "inline body not verified"`.
- **Risk:** Med — statuses flip for existing users; release notes.

---

## Sprint 2 — Structural (refactor & tech-debt)

### TICKET-1 · Type the Mailgun client properly — **P2/S/tech-debt**
- Import `IMailgunClient` from `mailgun.js`. Type `client_` and `initializeClient_(): Promise<IMailgunClient>`. Pure compile-time. **Risk:** Low.

### TICKET-2 · Drop `(notification as any)` casts — **P2/S/tech-debt**
- Local `MailgunNotificationDTO extends ProviderSendNotificationDTO` with `from?` and `attachments?`. Narrow once via `toMailgunDTO()` helper. **Depends on:** TICKET-3. **Risk:** Low.

### TICKET-5 · Clean up checklist `configModule` lookup — **P2/S/refactor**
- Resolve `Modules.NOTIFICATION` or read typed `ConfigModule` from `@medusajs/framework/types`. Extract `findMailgunProviderConfig()`. **Risk:** Med — touches admin route boot.

### TICKET-6 · Deduplicate Mailgun bootstrap — **P2/M/refactor**
- New `src/modules/mailgun/client.ts` exporting `createMailgunClient(opts)`. Import from both service and route. One region→URL switch. **Depends on:** TICKET-1, TICKET-5. **Risk:** Low.

### TICKET-8 · Make `EVENT_MAP` configurable — **P2/M/tech-debt**
- Plugin option `eventMap?: Record<string, {template; required?}>` merged with defaults. Document in README. **Depends on:** TICKET-7. **Risk:** Low.

### TICKET-14 · `crypto.randomUUID()` for correlation IDs — **P2/XS/security**
- Replace `Math.random().toString(36).slice(2,10)` at `service.ts:170` and `route.ts:46`. Optionally prefix `mg_`. **Risk:** Low.

### TICKET-15 · Use Medusa's logger — **P2/S/tech-debt**
- Resolve `ContainerRegistrationKeys.LOGGER`; replace all `console.error/warn`. Include correlation ID in every log. **Depends on:** TICKET-5. **Risk:** Low.

---

## Sprint 3 — Polish (devex & UX)

### TICKET-11 · Enable `collectCoverage` or remove threshold — **P3/XS/devex**
- Add `collectCoverage: true` + `collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/admin/**']`, or delete the threshold block. **Risk:** Low.

### TICKET-16 · Replace `forceUpdate` timer — **P3/S/refactor**
- `<time dateTime>` + single `useNow(60_000)` hook at page root, or `Intl.RelativeTimeFormat`. Drop per-row forceUpdate at `page.tsx:403,425`. **Risk:** Low.

### TICKET-17 · Fix `HintText` abbreviation breakage — **P3/S/bug**
- Drop the JS split. CSS `-webkit-line-clamp: 2` + show-more toggle. Full text stays in DOM for a11y. **Risk:** Low.

---

## Dependency Graph
```
TICKET-1 ──┐
           ├──► TICKET-6
TICKET-5 ──┤
           └──► TICKET-15
TICKET-3 ──► TICKET-2
TICKET-7 ──► TICKET-8
TICKET-9  (blocks further checklist UI work)
TICKET-14 (independent — pair with 15 in one commit)
```

## Recommended Execution Order
1. **Day 1 hotfix PR:** TICKET-3, 10, 12, 13 (P0s + security export). Ship as patch release.
2. **Sprint 1 remainder:** 4, 7, 9, 18.
3. **Sprint 2:** 1 → 5 → 6, then 2, 8, 14, 15 (parallel-safe after deps).
4. **Sprint 3:** 11, 16, 17 — bundle as a single UX/devex PR.

**Top of backlog:** TICKET-3 (customer-facing data leak) and TICKET-13 (build-tree exposure). Everything else is downstream of those two not biting you in production first.
