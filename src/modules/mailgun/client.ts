import FormData from "form-data"
import type { Interfaces } from "mailgun.js/definitions"
type IMailgunClient = Interfaces.IMailgunClient

export type CreateMailgunClientOptions = {
  api_key: string
  region?: "us" | "eu"
}

/**
 * Single source of truth for constructing a Mailgun API client.
 *
 * Both the notification provider service and the admin checklist route
 * previously inlined their own copy of this bootstrap (dynamic import +
 * region→URL switch + `new Mailgun(FormData).client(...)`). Centralizing it
 * here means there is exactly one place to update when the SDK or region
 * mapping changes.
 *
 * The dynamic import is preserved (rather than a top-level static import)
 * so the heavy `mailgun.js` module is only loaded the first time a client
 * is actually constructed.
 */
export async function createMailgunClient(
  opts: CreateMailgunClientOptions
): Promise<IMailgunClient> {
  const { default: Mailgun } = await import("mailgun.js")
  const mailgun = new Mailgun(FormData)
  const url =
    opts.region === "eu"
      ? "https://api.eu.mailgun.net"
      : "https://api.mailgun.net"
  return mailgun.client({
    username: "api",
    key: opts.api_key,
    url,
  })
}
