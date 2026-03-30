# Medusa Notification Events

Medusa emits events for commerce operations but **sends no email by default**. There are no built-in subscribers — every email you want sent requires a subscriber you write, a Mailgun template you create, and a `createNotifications()` call that wires them together.

Event payloads contain only `{ id }`. Your subscriber must fetch the full object (order, customer, etc.) before it can populate a template.

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

## Practical starting point

For a launch-ready storefront, implement these four first:

1. **`order-confirmation`** (`order.placed`) — customers expect this immediately after checkout; most payment processors also use it as proof of purchase
2. **`password-reset`** (`auth.password_reset`) — blocks account access without it; affects both customers and admin users
3. **`order-shipped`** / **`shipment-notification`** — the most common source of "where's my order" support tickets
4. **`admin-invite`** (`invite.created` + `invite.resent`) — required to onboard team members to the admin dashboard

The remaining events can be added later. Medusa fires the event and continues regardless of whether a subscriber handles it — nothing breaks if a template is missing.

## Subscriber pattern

Each subscriber follows the same shape. The `order.placed` example:

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
      display_id: order.display_id,
      customer_name: order.customer?.first_name,
      total: order.total,
    },
  })
}

export const config: SubscriberConfig = { event: "order.placed" }
```

The `template` string must match the template name in your Mailgun dashboard exactly. All fields in `data` are forwarded as Handlebars variables (e.g. `{{order_id}}`, `{{customer_name}}`).

## Password reset specifics

The `auth.password_reset` event payload includes `actor_type` to distinguish customers from admin users, and a `token` used to build the reset URL:

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

## Template variables reference

Common variables to define in your Mailgun templates by event:

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
