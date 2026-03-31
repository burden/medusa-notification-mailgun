# Checklist Endpoint

`GET /admin/mailgun/checklist` returns a diagnostic report of your Mailgun notification setup. For each event in the [event reference](./medusa-notification-events.md), it checks whether a subscriber exists, whether that subscriber references the expected Mailgun template name, and whether that template exists in your Mailgun account.

Use it during development to see what's wired up, and in CI to gate deployments on a complete configuration.

## Requirements

**Authentication**: Requires an active admin session or a bearer token.

```sh
Authorization: Bearer <admin_token>
```

**Template verification**: The endpoint reads `api_key`, `domain`, and `region` from the plugin options in `medusa-config.ts` — specifically from the provider entry with `id: "mailgun"`. If the plugin is not registered or those options are missing, `mailgun_templates_reachable` will be `false`, `template_exists_in_mailgun` will be `null` for all events, and `mailgun_error` will explain why.

The recommended way to supply credentials is via environment variables referenced in `medusa-config.ts`:

```ts
options: {
  api_key: process.env.MAILGUN_API_KEY,
  domain: process.env.MAILGUN_DOMAIN,
  region: process.env.MAILGUN_REGION ?? "us",  // "eu" if your account uses the EU endpoint
}
```

This keeps secrets out of source control while ensuring the checklist endpoint can reach them.

## Response shape

```jsonc
{
  "status": "pass" | "warn" | "fail",
  "checked_at": "<ISO 8601 timestamp>",
  "subscriber_root_found": true | false,
  "mailgun_templates_reachable": true | false,
  "mailgun_error": "<error message>",   // only present if Mailgun was unreachable
  "inline_count": 0,                    // number of events with "inline" status
  "events": [ /* one entry per tracked event — see below */ ]
}
```

### Top-level fields

| Field | Type | Description |
|---|---|---|
| `status` | `"pass"` \| `"warn"` \| `"fail"` | Worst status across all events, ignoring `inline`. See [Status semantics](#status-semantics). |
| `checked_at` | `string` | ISO 8601 timestamp of when the check ran. |
| `subscriber_root_found` | `boolean` | Whether `src/subscribers/` exists. `false` means all events will be `fail`. |
| `mailgun_templates_reachable` | `boolean` | Whether the Mailgun Templates API responded successfully. `false` means `template_exists_in_mailgun` will be `null` for all events. |
| `mailgun_error` | `string` | Present only when `api_key`/`domain` are absent from the plugin options or the Mailgun API call failed. |
| `inline_count` | `number` | Count of events with `inline` status. Always present; `0` when there are none. |

### Per-event fields (`events` array)

| Field | Type | Description |
|---|---|---|
| `event` | `string` | The Medusa event name (e.g. `"order.placed"`). |
| `expected_template` | `string` | The Mailgun template name this plugin expects for the event. |
| `subscriber_file` | `string` \| `null` | Relative path to the subscriber file that references this event, or `null` if none was found. |
| `subscriber_found` | `boolean` | Whether any file in `src/subscribers/` references this event name. |
| `template_name_in_subscriber` | `string` \| `null` | The template name extracted from the subscriber file (e.g. `"order-confirmation"`), or `null` if no static template name was found or no subscriber exists. |
| `template_exists_in_mailgun` | `boolean` \| `null` | Whether the template exists in your Mailgun account. `null` when the Mailgun API was unreachable or the event has `inline` status — see [null values](#template_exists_in_mailgun-null). |
| `status` | `"pass"` \| `"warn"` \| `"inline"` \| `"fail"` | Per-event result. See [Status semantics](#status-semantics). |
| `hint` | `string` | Present on `warn`, `inline`, and `fail`. Describes what is missing or notable and how to act on it. |

## Status semantics

| Status | Meaning |
|---|---|
| `pass` | Subscriber found, a static template name was detected in the file, and that template exists in Mailgun. |
| `warn` | Subscriber found and a static template name was detected, but that template does not exist in Mailgun yet. |
| `inline` | Subscriber found, but no static template name was detected in the file. The subscriber may be sending inline HTML or plain text, which is valid. See [Inline status](#inline-status). |
| `fail` | No subscriber file was found for the event. |

The top-level `status` field reflects the worst result across all events, **excluding `inline`**: any `fail` makes it `fail`; no `fail` but at least one `warn` makes it `warn`; otherwise it is `pass`. `inline` events do not affect the rollup — a project where every subscriber uses inline content reports top-level `pass`.

## Inline status

An event gets `inline` status when a subscriber file references the event name but no static `template:` assignment with a string literal value is found in the file.

This is a neutral observation, not an error. It means the scanner cannot determine from static analysis what the subscriber sends. Common reasons:

- The subscriber sends inline HTML directly in the `createNotifications` call rather than referencing a named template.
- The subscriber sends plain text.
- The template name is constructed dynamically and is not a literal string the scanner can match.

**What to do**: Nothing, if this is intentional. If you meant to use Mailgun templates, add `template: "your-template-name"` as a literal string in your `createNotifications` call so the scanner can find it.

The `hint` field on `inline` events reads: `Subscriber found but no static template name was detected. If this subscriber sends inline HTML or plain text, this is expected. If you intended to use Mailgun templates, add template: "your-template-name" to your createNotifications call.`

`template_exists_in_mailgun` is always `null` for `inline` events. Because no template name was confirmed in the subscriber, the Mailgun lookup is skipped entirely — the result would be meaningless.

## `template_exists_in_mailgun: null`

A `null` value has two distinct causes:

1. **Mailgun API unreachable** — the endpoint could not reach the Mailgun Templates API (missing or invalid plugin options, network issue, wrong domain). When `mailgun_templates_reachable` is `false`, every event that would otherwise receive a boolean result will have `null` instead. Check `mailgun_error` for the underlying reason.

2. **Event has `inline` status** — the subscriber did not reference the expected template name, so the Mailgun lookup was skipped entirely. There is no meaningful result to return.

`null` is distinct from `false`. `false` means the API responded and confirmed the template does not exist in Mailgun.

## Example response

```json
{
  "status": "warn",
  "checked_at": "2026-03-30T14:22:05.341Z",
  "subscriber_root_found": true,
  "mailgun_templates_reachable": true,
  "inline_count": 1,
  "events": [
    {
      "event": "order.placed",
      "expected_template": "order-confirmation",
      "subscriber_file": "src/subscribers/order-placed.ts",
      "subscriber_found": true,
      "template_name_in_subscriber": "order-confirmation",
      "template_exists_in_mailgun": true,
      "status": "pass"
    },
    {
      "event": "auth.password_reset",
      "expected_template": "password-reset",
      "subscriber_file": "src/subscribers/reset-password.ts",
      "subscriber_found": true,
      "template_name_in_subscriber": "password-reset",
      "template_exists_in_mailgun": false,
      "status": "warn",
      "hint": "Subscriber references template \"password-reset\" but it was not found in Mailgun. Create it in your Mailgun dashboard."
    },
    {
      "event": "customer.created",
      "expected_template": "welcome",
      "subscriber_file": "src/subscribers/customer-created.ts",
      "subscriber_found": true,
      "template_name_in_subscriber": null,
      "template_exists_in_mailgun": null,
      "status": "inline",
      "hint": "Subscriber found but no static template name was detected. If this subscriber sends inline HTML or plain text, this is expected. If you intended to use Mailgun templates, add template: \"your-template-name\" to your createNotifications call."
    },
    {
      "event": "order.canceled",
      "expected_template": "order-canceled",
      "subscriber_file": null,
      "subscriber_found": false,
      "template_name_in_subscriber": null,
      "template_exists_in_mailgun": null,
      "status": "fail",
      "hint": "No subscriber found for event \"order.canceled\". Create src/subscribers/<name>.ts with config: { event: \"order.canceled\" } and call createNotifications with template: \"order-canceled\"."
    }
  ]
}
```

## Usage

### curl

```sh
curl -H "Authorization: Bearer <admin_token>" \
  https://yourstore.com/admin/mailgun/checklist | jq .
```

### CI gate

```sh
# Fail CI if any event is not fully configured (pass required for all events)
curl -sf -H "Authorization: Bearer $MEDUSA_ADMIN_TOKEN" \
  "$MEDUSA_BACKEND_URL/admin/mailgun/checklist" \
  | jq -e '.status == "pass"'
```

The `jq -e` flag exits with code 1 if the expression evaluates to `false` or `null`, making the step fail in CI. With `.status == "pass"`, any `warn` or `fail` will break the build.

`inline` events do not affect `status`. A project where every subscriber uses inline HTML or plain text — and none reference Mailgun template names — will report `status: "pass"` and pass this check. If you want to require that all subscribers use named Mailgun templates, check `inline_count` as well:

```sh
# Fail CI if any subscriber is inline (not referencing a Mailgun template name)
curl -sf -H "Authorization: Bearer $MEDUSA_ADMIN_TOKEN" \
  "$MEDUSA_BACKEND_URL/admin/mailgun/checklist" \
  | jq -e '.status == "pass" and .inline_count == 0'
```

If you want to allow warnings — meaning subscribers are correctly wired but some Mailgun templates haven't been created yet — use `.status != "fail"` instead:

```sh
# Fail CI only if a subscriber is missing or misconfigured; allow missing templates
curl -sf -H "Authorization: Bearer $MEDUSA_ADMIN_TOKEN" \
  "$MEDUSA_BACKEND_URL/admin/mailgun/checklist" \
  | jq -e '.status != "fail"'
```

## What the checklist does not verify

The checklist is a static scan combined with a Mailgun API lookup. It does not check:

- Whether `channel: "email"` is set in the `createNotifications` call. A subscriber that uses a different channel will still show as `pass` if the template name string is present.
- Whether the variables passed in `data` match the variables your Mailgun template expects. Mismatched variables produce empty fields in the email at send time, not an error here.
- Whether the subscriber is actually invoked when the event fires at runtime. Medusa configuration issues (e.g. the subscriber file not being picked up by the loader) are outside the scope of this check.

For a full end-to-end verification, place a test order (or trigger the event manually) and confirm the email arrives.
