# How to wire Medusa events to Mailgun templates

Medusa emits events for commerce operations — order placed, shipment created, password reset, and more — but **sends no email by default**. There are no built-in subscribers. Every email you want sent requires three things you write and configure yourself:

1. A **Mailgun template** in your Mailgun dashboard
2. A **subscriber file** in `src/subscribers/` that listens for the event
3. A **`createNotifications()` call** in that subscriber that passes the template name and data

This guide covers the full pattern and walks through the most important events. For a step-by-step walkthrough of the first email from scratch, see the [quickstart](./quickstart.md).

## Prerequisites

- Plugin installed and registered in `medusa-config.ts` (see [README installation](../README.md#installation))
- A Mailgun account with a verified sending domain

## How subscribers work

Medusa event payloads contain only `{ id }`. Your subscriber must fetch the full object — order, customer, etc. — before it can populate a template.

The general pattern:

```ts
// src/subscribers/<event-name>.ts
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"
import { Modules } from "@medusajs/framework/utils"

export default async function myHandler({
  event: { data: { id } },
  container,
}: SubscriberArgs<{ id: string }>) {
  const thingService = container.resolve(Modules.THING)
  const notificationService = container.resolve(Modules.NOTIFICATION)

  const thing = await thingService.retrieveThing(id, { relations: [...] })

  await notificationService.createNotifications({
    to: thing.email,
    channel: "email",
    template: "my-mailgun-template-name",
    data: {
      subject: "...",
      variable_one: thing.field,
      variable_two: thing.other_field,
    },
  })
}

export const config: SubscriberConfig = { event: "thing.event_name" }
```

The `template` string must match the template name in your Mailgun dashboard exactly. All fields in `data` are forwarded as Handlebars variables (e.g. `{{variable_one}}`).

## Practical starting point

For a launch-ready storefront, implement these four first:

1. **`order-confirmation`** (`order.placed`) — customers expect this immediately after checkout; most payment processors also use it as proof of purchase
2. **`password-reset`** (`auth.password_reset`) — blocks account access without it; affects both customers and admin users
3. **`order-shipped`** / **`shipment-notification`** — the most common source of "where's my order" support tickets
4. **`admin-invite`** (`invite.created` + `invite.resent`) — required to onboard team members to the admin dashboard

The remaining events can be added later. Medusa fires events and continues regardless of whether a subscriber handles them — nothing breaks if a template is missing.

## Order placed

```ts
// src/subscribers/order-placed.ts
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
      order_id: order.id,
      display_id: String(order.display_id),
      customer_name: order.customer?.first_name,
      total: String(order.total),
    },
  })
}

export const config: SubscriberConfig = { event: "order.placed" }
```

## Password reset

The `auth.password_reset` event is shared between customers and admin users. The payload includes `actor_type` to distinguish them and a `token` to build the reset URL. The subscriber does not need to fetch a separate object — all required data arrives in the event payload.

```ts
// src/subscribers/reset-password.ts
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"
import { Modules } from "@medusajs/framework/utils"

export default async function resetPasswordHandler({
  event: { data: { entity_id: email, token, actor_type } },
  container,
}: SubscriberArgs<{ entity_id: string; token: string; actor_type: string }>) {
  const notificationService = container.resolve(Modules.NOTIFICATION)
  const config = container.resolve("configModule")

  const urlPrefix = actor_type === "customer"
    ? config.admin.storefrontUrl || "https://storefront.com"
    : `${config.admin.backendUrl}${config.admin.path}`

  await notificationService.createNotifications({
    to: email,
    channel: "email",
    template: "password-reset",
    data: {
      subject: "Reset your password",
      reset_url: `${urlPrefix}/reset-password?token=${token}&email=${email}`,
    },
  })
}

export const config: SubscriberConfig = { event: "auth.password_reset" }
```

## Full event reference

### Customer-facing (storefront UX)

| Event | Suggested template name | Notes |
|---|---|---|
| `order.placed` | `order-confirmation` | Most critical — sent immediately after checkout |
| `order.canceled` | `order-canceled` | |
| `order.fulfillment_created` | `order-shipped` | Triggered when admin creates a fulfillment |
| `shipment.created` | `shipment-notification` | Triggered when shipment tracking is added |
| `delivery.created` | `order-delivered` | Optional |
| `order.return_requested` | `return-confirmed` | Confirms return was initiated by customer |
| `order.return_received` | `return-received` | Admin marked return as received |
| `order.exchange_created` | `exchange-created` | If you use exchanges |
| `auth.password_reset` | `password-reset` | Fired for both customers and admin users |
| `customer.created` | `welcome` | Optional welcome email on registration |

### Admin-facing

| Event | Suggested template name | Notes |
|---|---|---|
| `invite.created` | `admin-invite` | Fired when an admin user is invited |
| `invite.resent` | `admin-invite` | Same template — token was refreshed |

## Template variables reference

Common variables to pass in `data` for each event:

| Template | Variables |
|---|---|
| `order-confirmation` | `{{order_id}}`, `{{display_id}}`, `{{customer_name}}`, `{{total}}` |
| `order-canceled` | `{{order_id}}`, `{{display_id}}` |
| `order-shipped` | `{{order_id}}`, `{{tracking_number}}`, `{{carrier}}` |
| `shipment-notification` | `{{tracking_number}}`, `{{tracking_url}}` |
| `order-delivered` | `{{order_id}}`, `{{display_id}}` |
| `return-confirmed` | `{{order_id}}`, `{{return_id}}` |
| `password-reset` | `{{reset_url}}` |
| `welcome` | `{{customer_name}}`, `{{email}}` |
| `admin-invite` | `{{invite_url}}`, `{{email}}` |
