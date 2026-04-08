import type { MedusaContainer } from "@medusajs/framework/types"
import type { EventCheckConfig } from "../../api/admin/mailgun/checklist/scan"

export type MailgunProviderOptions = {
  api_key?: string
  domain?: string
  region?: "us" | "eu"
  from?: string
  /**
   * Optional override / extension to the built-in checklist EVENT_MAP.
   * Each entry maps a Medusa event name to its expected Mailgun template.
   * Entries here override built-ins with the same `event` key; new entries
   * are appended.
   */
  eventMap?: EventCheckConfig[]
}

/**
 * Locate the Mailgun notification provider's options on the resolved
 * `configModule`. Centralized so the admin route, the checklist scanner,
 * and any future caller all read from the same shape and key.
 *
 * Returns `undefined` when the plugin isn't registered (e.g. running in a
 * dev environment without Mailgun configured) — callers decide how to
 * surface that.
 */
export function findMailgunProviderConfig(
  scope: MedusaContainer
): MailgunProviderOptions | undefined {
  // `configModule` is registered by Medusa's framework but not exposed on the
  // public types — fall back to a structural cast.
  const configModule = scope.resolve("configModule") as {
    modules?: Record<
      string,
      | {
          options?: { providers?: Array<{ id?: string; options?: MailgunProviderOptions }> }
        }
      | undefined
    >
  }

  const providers =
    configModule?.modules?.["notification"]?.options?.providers ?? []
  const found = providers.find((p) => p?.id === "mailgun")
  return found?.options
}
