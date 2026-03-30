# medusa-notification-mailgun

Mailgun notification provider plugin for [MedusaJS](https://medusajs.com/) v2.

Sends transactional emails via the Mailgun HTTP API. Supports stored templates, inline HTML/text, and file attachments.

## Prerequisites

- Node.js v20+
- MedusaJS v2.3.0+
- A [Mailgun](https://www.mailgun.com/) account with a verified sending domain

## Installation

```bash
npm install medusa-notification-mailgun mailgun.js
```

`mailgun.js` is a peer dependency — you install it alongside the plugin.

## Configuration

Add the provider to your `medusa-config.ts`:

```ts
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
              from: process.env.MAILGUN_FROM,  // optional, defaults to noreply@<domain>
              region: "us",                     // "us" or "eu"
            },
          },
        ],
      },
    },
  ],
})
```

## Options

| Option   | Required | Default            | Description                          |
| -------- | -------- | ------------------ | ------------------------------------ |
| `api_key` | Yes      | —                  | Your Mailgun API key                 |
| `domain` | Yes      | —                  | Your verified Mailgun sending domain |
| `from`   | No       | `noreply@<domain>` | Default sender address               |
| `region` | No       | `"us"`             | Mailgun region: `"us"` or `"eu"`     |

## Usage

The provider integrates with Medusa's notification system. Emails are sent automatically when notification events fire, or you can send manually:

### Mailgun stored template

```ts
await notificationService.send({
  to: "customer@example.com",
  channel: "email",
  template: "order-confirmation",
  data: {
    subject: "Order Confirmed",
    order_id: "ord_123",
  },
})
```

Template variables are passed to Mailgun via the `X-Mailgun-Variables` header for server-side rendering.

### Localized templates

The plugin supports Mailgun's [template versions](https://documentation.mailgun.com/docs/mailgun/api-reference/openapi-final/tag/Templates/) for localization. Create versions of your template in the Mailgun dashboard tagged by locale (e.g., `en`, `fr`, `de`), then pass `locale` in `data`:

```ts
await notificationService.send({
  to: "customer@example.com",
  channel: "email",
  template: "order-confirmation",
  data: {
    locale: "fr",
    subject: "Commande confirmée",
    order_id: "ord_123",
  },
})
```

When `locale` is present, the plugin sets the Mailgun `t:version` header to select the matching template version. If omitted, Mailgun uses the default version.

### Inline HTML

```ts
await notificationService.send({
  to: "customer@example.com",
  channel: "email",
  data: {
    subject: "Welcome!",
    html: "<h1>Welcome to our store</h1>",
  },
})
```

### Plain text

```ts
await notificationService.send({
  to: "customer@example.com",
  channel: "email",
  data: {
    subject: "Your receipt",
    text: "Thanks for your order.",
  },
})
```

### Content priority

When multiple content fields are present, the provider uses this priority:

1. `template` — Mailgun stored template with variable substitution
2. `data.html` — raw HTML body
3. `data.text` — plain text body
4. Fallback — JSON-stringified `data` object

## Development

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Start in development mode (watches for changes)
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

> **Note:** `npm link` symlinks the package but does not rebuild automatically. Run `npm run build` in the plugin directory after any source changes, or use `npm run dev` which watches for changes and rebuilds continuously.

## Testing

The test suite uses Jest with ts-jest and covers:

- Option validation (`validateOptions`)
- All content paths (stored templates, inline HTML, plain text, fallback)
- Localized template version selection (`t:version`)
- Sender address resolution and subject defaults
- Base64 attachment decoding
- Mailgun API error wrapping
- EU region endpoint configuration

```bash
npm test
```

## License

MIT
