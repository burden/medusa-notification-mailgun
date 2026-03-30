# medusa-notification-mailgun

Mailgun notification provider plugin for [MedusaJS](https://medusajs.com/) v2.

Sends transactional emails via the Mailgun HTTP API. Supports stored templates (with localization), inline HTML/text, file attachments, and includes an Admin UI page for sending test emails.

**Requires MedusaJS v2.3.0 or later.**

## Prerequisites

- Node.js v20+
- MedusaJS v2.3.0+
- A [Mailgun](https://www.mailgun.com/) account with a verified sending domain

## Installation

```bash
npm install medusa-notification-mailgun mailgun.js
# or
yarn add medusa-notification-mailgun mailgun.js
# or
pnpm add medusa-notification-mailgun mailgun.js
```

`mailgun.js` is a peer dependency — install it alongside the plugin.

## Configuration

Register the provider in `medusa-config.ts` inside the `notification` module:

```ts
import { defineConfig } from "@medusajs/framework/utils"

module.exports = defineConfig({
  // ...
  modules: [
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "medusa-notification-mailgun/providers/notification-mailgun",
            id: "mailgun",
            options: {
              channels: ["email"],
              api_key: process.env.MAILGUN_API_KEY,
              domain: process.env.MAILGUN_DOMAIN,
              from: process.env.MAILGUN_FROM,  // optional
              region: "us",                     // optional
            },
          },
        ],
      },
    },
  ],
})
```

### Options

| Option    | Required | Default              | Description                                           |
|-----------|----------|----------------------|-------------------------------------------------------|
| `api_key` | Yes      | —                    | Your Mailgun API key                                  |
| `domain`  | Yes      | —                    | Your verified Mailgun sending domain                  |
| `from`    | No       | `noreply@<domain>`   | Default sender address used when `from` is not passed per-notification |
| `region`  | No       | `"us"`               | Mailgun API region: `"us"` or `"eu"`                  |

Set environment variables in your `.env` file:

```bash
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_FROM=no-reply@yourdomain.com
```

## Usage

The provider integrates with Medusa's built-in notification system. Medusa dispatches notifications automatically on commerce events (order placed, shipment created, etc.) when you subscribe to them. You can also send manually.

### Sending a notification manually

Use `notificationService.createNotifications()` from within a workflow, subscriber, or API route:

```ts
const notificationService = container.resolve("notification")

await notificationService.createNotifications({
  to: "customer@example.com",
  channel: "email",
  template: "order-confirmation",
  data: {
    subject: "Your order is confirmed",
    order_id: "ord_123",
    customer_name: "Alice",
  },
})
```

### The `data` payload

The `data` object serves two purposes: it controls how the email is built, and it carries template variables.

| Field     | Type     | Description                                                                 |
|-----------|----------|-----------------------------------------------------------------------------|
| `subject` | `string` | Email subject line. Defaults to `"Notification"` if omitted.                |
| `locale`  | `string` | Selects a Mailgun template version (e.g. `"fr"`, `"de"`). Only used when `template` is set. |
| `html`    | `string` | Inline HTML body. Used when no `template` is set.                           |
| `text`    | `string` | Plain-text body. Used when neither `template` nor `html` is set.            |
| any other | `string` | Additional keys are passed to Mailgun as template variables.                |

### Content selection

The provider selects the message body using this priority order:

1. `template` — a Mailgun stored template; all `data` fields are passed as `X-Mailgun-Variables`.
2. `data.html` — raw HTML body (no template).
3. `data.text` — plain-text body.
4. Fallback — the entire `data` object is JSON-stringified and sent as plain text.

### Stored template

```ts
await notificationService.createNotifications({
  to: "customer@example.com",
  channel: "email",
  template: "order-confirmation",
  data: {
    subject: "Your order is confirmed",
    order_id: "ord_123",
  },
})
```

Template variables are forwarded to Mailgun via the `X-Mailgun-Variables` header, where they are available inside the template using Mailgun's Handlebars syntax.

### Localized template

Create multiple versions of a template in the Mailgun dashboard, tagging each with a locale (e.g. `en`, `fr`, `de`). Pass `locale` in `data` to select the matching version:

```ts
await notificationService.createNotifications({
  to: "customer@example.com",
  channel: "email",
  template: "order-confirmation",
  data: {
    locale: "fr",
    subject: "Votre commande est confirmée",
    order_id: "ord_123",
  },
})
```

When `locale` is present, the plugin sets Mailgun's `t:version` parameter to select that template version. If `locale` is omitted, Mailgun uses the template's default version.

### Inline HTML

```ts
await notificationService.createNotifications({
  to: "customer@example.com",
  channel: "email",
  data: {
    subject: "Welcome!",
    html: "<h1>Welcome to our store</h1><p>Thanks for signing up.</p>",
  },
})
```

### Plain text

```ts
await notificationService.createNotifications({
  to: "customer@example.com",
  channel: "email",
  data: {
    subject: "Your receipt",
    text: "Thanks for your order. Your total was $42.00.",
  },
})
```

### Attachments

Pass base64-encoded file content in the `attachments` field (non-standard extension on the notification DTO):

```ts
await notificationService.createNotifications({
  to: "customer@example.com",
  channel: "email",
  data: { subject: "Your invoice", text: "See attached." },
  attachments: [
    {
      filename: "invoice.pdf",
      content: "<base64-encoded content>",
    },
  ],
} as any)
```

### Overriding the sender address

Pass a `from` field on the notification to override the plugin-level default for a single send:

```ts
await notificationService.createNotifications({
  to: "customer@example.com",
  channel: "email",
  from: "billing@yourdomain.com",
  data: { subject: "Invoice", text: "..." },
} as any)
```

## Admin UI

The plugin ships an admin extension that adds a **Mailgun Test** page to your Medusa Admin dashboard.

### Accessing the page

Navigate to your Medusa Admin and select **Mailgun Test** from the sidebar (envelope icon). The route is available at `/app/mailgun-test`.

### What it does

The page lets you send a test email directly from the dashboard without writing code. You can:

- Set the recipient address and subject.
- Optionally specify a Mailgun template name to test a stored template.
- Optionally override the sender address for this send.
- Add key-value template variables that are forwarded to Mailgun.

If no template is specified and no variables produce an HTML or text body, the plugin sends a plain-text fallback: `Test email — subject: <subject>`.

The form posts to the authenticated API endpoint `POST /admin/mailgun/test`, which routes through Medusa's notification service using `provider_id: "mailgun"`.

### Test endpoint

You can also call the endpoint directly from any HTTP client authenticated as an admin:

```
POST /admin/mailgun/test
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "to": "recipient@example.com",
  "subject": "Hello from Mailgun",
  "template": "welcome",           // optional
  "from": "sender@example.com",    // optional
  "data": {                        // optional — string values only
    "customer_name": "Alice"
  }
}
```

Response on success:

```json
{ "success": true, "notification_id": "noti_01..." }
```

## Development

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Start in watch/develop mode
npm run dev

# Run tests
npm test
```

This plugin uses the official Medusa plugin toolchain (`medusa plugin:build` / `medusa plugin:develop`).

### Local development with npm link

To test the plugin in a local Medusa project before publishing:

```bash
# In this plugin directory — build first, then link
npm run build
npm link

# In your Medusa project
npm link medusa-notification-mailgun
```

After any source change, run `npm run build` in the plugin directory again, or keep `npm run dev` running to rebuild continuously.

## Tests

The test suite uses Jest and ts-jest. Run with:

```bash
npm test
```

Coverage includes:

- `validateOptions` — rejects missing `api_key` or `domain`
- Template path — `X-Mailgun-Variables` header, `t:version` locale selection
- Inline HTML and plain-text paths
- Fallback path — JSON-stringified `data`
- Sender resolution — configured address vs. `noreply@<domain>` default
- Subject default (`"Notification"`) when `data.subject` is absent
- Base64 attachment decoding
- Mailgun API error wrapping (`error.details`, `error.message`, unknown errors)
- EU region endpoint selection (`https://api.eu.mailgun.net`)
- Return value — `id` field with `message` field fallback

## License

MIT
