import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { scanSubscribers, EVENT_MAP } from "./scan"
import * as fs from "fs"
import * as path from "path"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const cwd = process.cwd()
  const subscriberRoot = path.join(cwd, "src", "subscribers")
  const subscriberRootFound = fs.existsSync(subscriberRoot)

  let mailgunTemplatesReachable = false
  let mailgunErrorMessage: string | undefined

  // Scan subscribers
  const scanResults = scanSubscribers(cwd, EVENT_MAP)

  // Fetch Mailgun templates using configured provider options
  let templateSet: Set<string> | null = null

  const configModule = req.scope.resolve("configModule") as any
  const providers: any[] = configModule?.modules?.["notification"]?.options?.providers ?? []
  const mailgunOptions = providers.find((p: any) => p.id === "mailgun")?.options ?? {}
  const apiKey: string | undefined = mailgunOptions.api_key
  const domain: string | undefined = mailgunOptions.domain
  const region: "us" | "eu" | undefined = mailgunOptions.region

  if (!apiKey || !domain) {
    mailgunErrorMessage = "Mailgun provider options (api_key, domain) not found. Ensure the plugin is registered in medusa-config.ts with id: \"mailgun\"."
  } else {
    try {
      const { default: Mailgun } = await import("mailgun.js")
      const { default: FormData } = await import("form-data")
      const mailgun = new Mailgun(FormData)
      const url = region === "eu"
        ? "https://api.eu.mailgun.net"
        : "https://api.mailgun.net"
      const client = mailgun.client({ username: "api", key: apiKey, url })
      const result = await client.domains.domainTemplates.list(domain)
      templateSet = new Set((result?.items ?? []).map((t: any) => t.name))
      mailgunTemplatesReachable = true
    } catch (err: any) {
      // Log full error server-side; return only a generic message to clients
      const corrId = Math.random().toString(36).slice(2, 10)
      console.error(`[mailgun-checklist][${corrId}] Failed to fetch templates:`, err)
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
    template_name_in_subscriber: boolean
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
      status = "inline"
      hint = `Subscriber found, but the expected template name "${scan.expected_template}" is not referenced in the file. If this subscriber sends inline HTML or plain text, this is expected. If you intended to use Mailgun templates, add template: "${scan.expected_template}" to your createNotifications call.`
    } else {
      templateExistsInMailgun = templateSet !== null ? templateSet.has(scan.expected_template) : null
      if (templateExistsInMailgun === true) {
        status = "pass"
      } else {
        status = "warn"
        hint = `Subscriber is correctly wired but template "${scan.expected_template}" was not found in Mailgun. Create it in your Mailgun dashboard.`
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
