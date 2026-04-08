import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import { randomUUID } from "crypto"
import * as fs from "fs"
import * as path from "path"
import { scanSubscribers, EVENT_MAP, type EventCheckConfig } from "./scan"
import { createMailgunClient } from "../../../../modules/mailgun/client"
import { findMailgunProviderConfig } from "../../../../modules/mailgun/config"

/**
 * Merge plugin-supplied event map overrides with the built-in defaults.
 * Caller-supplied entries override built-ins with the same `event` key;
 * new entries are appended to the end of the list.
 */
function mergeEventMap(
  base: EventCheckConfig[],
  overrides?: EventCheckConfig[]
): EventCheckConfig[] {
  if (!overrides?.length) return base
  const byEvent = new Map<string, EventCheckConfig>()
  for (const e of base) byEvent.set(e.event, e)
  for (const e of overrides) byEvent.set(e.event, e)
  return Array.from(byEvent.values())
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Logger
  const cwd = process.cwd()
  const subscriberRoot = path.join(cwd, "src", "subscribers")
  const subscriberRootFound = fs.existsSync(subscriberRoot)

  let mailgunTemplatesReachable = false
  let mailgunErrorMessage: string | undefined

  const mailgunOptions = findMailgunProviderConfig(req.scope) ?? {}
  const eventMap = mergeEventMap(EVENT_MAP, mailgunOptions.eventMap)

  // Scan subscribers
  const scanResults = scanSubscribers(cwd, eventMap)

  // Fetch Mailgun templates using configured provider options
  let templateSet: Set<string> | null = null

  const apiKey = mailgunOptions.api_key
  const domain = mailgunOptions.domain
  const region = mailgunOptions.region

  if (!apiKey || !domain) {
    mailgunErrorMessage = "Mailgun provider options (api_key, domain) not found. Ensure the plugin is registered in medusa-config.ts with id: \"mailgun\"."
  } else {
    const corrId = newCorrelationId()
    try {
      const client = await createMailgunClient({ api_key: apiKey, region })
      const result = await client.domains.domainTemplates.list(domain)
      const items = (result as { items?: Array<{ name: string }> })?.items ?? []
      templateSet = new Set(items.map((t) => t.name))
      mailgunTemplatesReachable = true
    } catch (err: unknown) {
      // Log full error server-side; return only a generic message to clients
      logger.error(`[mailgun-checklist][${corrId}] Failed to fetch templates: ${formatError(err)}`)
      mailgunErrorMessage = `Failed to fetch Mailgun templates (ref: ${corrId})`
      mailgunTemplatesReachable = false
    }
  }

  // Build per-event results
  type EventResult = {
    event: string
    expected_template: string
    subscriber_file: string | null
    subscriber_found: boolean
    template_name_in_subscriber: string | null
    template_exists_in_mailgun: boolean | null
    status: "pass" | "warn" | "inline" | "fail"
    hint?: string
  }

  const events: EventResult[] = scanResults.map((scan) => {
    let status: "pass" | "warn" | "inline" | "fail"
    let hint: string | undefined
    let templateExistsInMailgun: boolean | null = null

    if (!scan.subscriber_found) {
      status = "fail"
      hint = `No subscriber found for event "${scan.event}". Create src/subscribers/<name>.ts with config: { event: "${scan.event}" } and call createNotifications with template: "${scan.expected_template}".`
    } else if (!scan.template_name_in_subscriber) {
      // TICKET-18: do not optimistically mark as inline. Require verifiable
      // content (non-empty inline html/text) before granting "inline" status;
      // otherwise surface as a warning so the rollup cannot report pass for a
      // subscriber whose body we couldn't actually see.
      if (scan.inline_html_present || scan.inline_text_present) {
        status = "inline"
        hint = `Subscriber sends inline ${
          scan.inline_html_present ? "HTML" : "text"
        } content. Inline bodies are not verified against Mailgun templates.`
      } else {
        status = "warn"
        hint = `Subscriber found for "${scan.event}" but no static template name, inline html, or inline text was detected. Inline body not verified — add a static template: "your-template-name" or inline html/text to your createNotifications call.`
      }
    } else {
      templateExistsInMailgun = templateSet !== null ? templateSet.has(scan.template_name_in_subscriber) : null
      if (templateExistsInMailgun === true) {
        status = "pass"
      } else {
        status = "warn"
        hint = `Subscriber references template "${scan.template_name_in_subscriber}" but it was not found in Mailgun. Create it in your Mailgun dashboard.`
      }
    }

    const result: EventResult = {
      event: scan.event,
      expected_template: scan.expected_template,
      subscriber_file: scan.subscriber_file,
      subscriber_found: scan.subscriber_found,
      template_name_in_subscriber: scan.template_name_in_subscriber,
      template_exists_in_mailgun: templateExistsInMailgun,
      status,
    }

    if (hint !== undefined) {
      result.hint = hint
    }

    return result
  })

  // Roll up top-level status — inline does not escalate
  let topStatus: "pass" | "warn" | "fail" = "pass"
  for (const e of events) {
    if (e.status === "fail") {
      topStatus = "fail"
      break
    }
    if (e.status === "warn") {
      topStatus = "warn"
    }
  }

  const inlineCount = events.filter((e) => e.status === "inline").length

  res.status(200).json({
    status: topStatus,
    checked_at: new Date().toISOString(),
    // subscriber_root intentionally omitted — absolute filesystem paths must not be leaked to clients
    subscriber_root_found: subscriberRootFound,
    mailgun_templates_reachable: mailgunTemplatesReachable,
    ...(mailgunErrorMessage ? { mailgun_error: mailgunErrorMessage } : {}),
    inline_count: inlineCount,
    events,
  })
}

function newCorrelationId(): string {
  return `mg_${randomUUID().replace(/-/g, "").slice(0, 12)}`
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
