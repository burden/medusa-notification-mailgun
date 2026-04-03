# Quickstart: Send your first transactional email

This tutorial walks you from a fresh Medusa installation to a working order confirmation email delivered through Mailgun. By the end you will have the plugin installed, configured, and confirmed sending email when an order is placed.

**Time**: ~15 minutes
**Prerequisites**: A running Medusa v2.3.0+ project. A Mailgun account with a verified sending domain.

## 1. Install the plugin

```bash
pnpm add @mdgar/medusa-notification-mailgun mailgun.js
```

`mailgun.js` is a peer dependency — install it alongside the plugin.

## 2. Add your Mailgun credentials

Add these to your `.env` file:

```bash
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_FROM=no-reply@yourdomain.com
```

`MAILGUN_FROM` is optional but recommended. It sets the default sender address for all outgoing emails. If omitted, the plugin defaults to `noreply@<your domain>`.

## 3. Register the plugin in medusa-config.ts

Two entries are needed: `plugins` loads the admin UI and API routes, `modules` registers the notification provider.

```ts
import { defineConfig } from "@medusajs/framework/utils"

module.exports = defineConfig({
  plugins: [
    "@mdgar/medusa-notification-mailgun",
  ],
  modules: [
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "@mdgar/medusa-notification-mailgun/providers/notification-mailgun",
            id: "mailgun",
            options: {
              channels: ["email"],
              api_key: process.env.MAILGUN_API_KEY,
              domain: process.env.MAILGUN_DOMAIN,
              from: process.env.MAILGUN_FROM,
            },
          },
        ],
      },
    },
  ],
})
```

## 4. Create a template in Mailgun

In the Mailgun dashboard, go to **Sending → Templates → Create Template**.

- Name it `order-confirmation` (this name must match what you pass in `template:` in your subscriber exactly)
- Subject: `Order confirmed — #{{display_id}}`
- Body:

```html
<p>Hi {{customer_name}},</p>
<p>Your order <strong>#{{display_id}}</strong> has been confirmed. Thank you for your purchase.</p>
```

Save and activate the template. Variables in `{{double_braces}}` are filled from the `data` object in your subscriber.

## 5. Write a subscriber

Create `src/subscribers/order-placed.ts`:

```ts
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"
import { Modules } from "@medusajs/framework/utils"

export default async function orderPlacedHandler({
  event: { data: { id } },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderService = container.resolve(Modules.ORDER)
  const notificationService = container.resolve(Modules.NOTIFICATION)

  const order = await orderService.retrieveOrder(id, {
    relations: ["items", "shipping_address", "customer"],
  })

  await notificationService.createNotifications({
    to: order.email,
    channel: "email",
    template: "order-confirmation",
    data: {
      subject: `Order confirmed — #${order.display_id}`,
      display_id: String(order.display_id),
      customer_name: order.customer?.first_name ?? "there",
    },
  })
}

export const config: SubscriberConfig = { event: "order.placed" }
```

Medusa event payloads only contain `{ id }`. The subscriber fetches the full order object before calling `createNotifications()`. All fields in `data` are passed to Mailgun as Handlebars variables and must be strings.

## 6. Start Medusa and place a test order

```bash
pnpm run dev
```

Place an order through your storefront. Within a few seconds the order confirmation email should arrive at the customer's address.

**No storefront yet?** Use the Admin UI test sender: open the **Mailgun** page in the admin sidebar, go to **Send Test**, and send a test email to yourself using the `order-confirmation` template with `display_id` and `customer_name` as template variables.

## Verify your setup

Open the **Event Checklist** tab in the Mailgun admin page, or run:

```bash
curl -H "Authorization: Bearer <admin-jwt>" \
  https://yourstore.com/admin/mailgun/checklist | jq .
```

The `order.placed` event should show `"status": "pass"`. Other events will show `"status": "fail"` until you add subscribers for them — that is expected.

## What's next

- **Add more emails** — see the [event wiring guide](./medusa-notification-events.md) for subscriber patterns covering password reset, shipment notifications, admin invites, and more.
- **Check coverage in CI** — see the [checklist endpoint reference](./checklist-endpoint.md) for CI gate patterns.
- **Advanced sending** — see [Sending notifications](../README.md#sending-notifications) in the README for localized templates, inline HTML, attachments, and per-notification sender overrides.
