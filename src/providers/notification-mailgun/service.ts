import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type {
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/types"
import FormData from "form-data"

export type MailgunOptions = {
  api_key: string
  domain: string
  from?: string
  region?: "us" | "eu"
}

class MailgunNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "mailgun"

  static validateOptions(options: Record<string, unknown>) {
    if (!options.api_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "MAILGUN_API_KEY is required"
      )
    }
    if (!options.domain) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "MAILGUN_DOMAIN is required"
      )
    }
    // SSRF guard: region must be one of the two known Mailgun API hosts
    if (options.region !== undefined && !["us", "eu"].includes(options.region as string)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "MAILGUN_REGION must be 'us' or 'eu'"
      )
    }
  }

  private client_: any
  private domain_: string
  private from_: string
  private options_: MailgunOptions

  constructor(container: Record<string, unknown>, options: MailgunOptions) {
    super()

    this.options_ = options
    this.domain_ = options.domain
    this.from_ = options.from || `noreply@${options.domain}`
  }

  private async initializeClient_(): Promise<any> {
    if (this.client_) {
      return this.client_
    }

    const { default: Mailgun } = await import("mailgun.js")
    const mailgun = new Mailgun(FormData)
    const url =
      this.options_.region === "eu"
        ? "https://api.eu.mailgun.net"
        : "https://api.mailgun.net"

    this.client_ = mailgun.client({
      username: "api",
      key: this.options_.api_key,
      url,
    })
    return this.client_
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const { to, template, data } = notification

    if (!to) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Recipient email address (to) is required"
      )
    }

    const messagePayload: Record<string, unknown> = {
      from: (notification as any).from?.trim() || (data?.from as string)?.trim() || this.from_,
      to: [to],
      subject: (data?.subject as string) || "Notification",
    }

    if (template && template !== "__inline__") {
      messagePayload.template = template
      // NOTE: data?.html is passed as a template variable, not rendered directly. If callers
      // supply untrusted HTML in data, Mailgun's template engine may render it — callers are
      // responsible for sanitizing HTML content before passing it here.
      const serializedData = JSON.stringify(data || {})
      // Cap h:X-Mailgun-Variables at 32 KB to prevent payload abuse
      const DATA_MAX_BYTES = 32 * 1024
      if (Buffer.byteLength(serializedData, "utf8") > DATA_MAX_BYTES) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Notification data object exceeds the 32 KB size limit"
        )
      }
      messagePayload["h:X-Mailgun-Variables"] = serializedData
      if (data?.locale) {
        messagePayload["t:version"] = data.locale as string
      }
    } else if (data?.html) {
      // NOTE: data.html is passed directly to Mailgun without sanitization.
      // Callers must ensure this value does not contain untrusted HTML.
      messagePayload.html = data.html as string
    } else if (data?.text) {
      messagePayload.text = data.text as string
    } else {
      messagePayload.text = JSON.stringify(data, null, 2)
    }

    const attachments = (notification as any).attachments
    if (attachments?.length) {
      // Validate each attachment filename and size before passing to Mailgun
      const SAFE_FILENAME = /^[\w\-. ]+$/
      const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25 MB per Mailgun's limit
      messagePayload.attachment = attachments.map(
        (att: { content: string; filename: string }) => {
          if (!SAFE_FILENAME.test(att.filename)) {
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              `Attachment filename contains invalid characters: ${att.filename}`
            )
          }
          const buf = Buffer.from(att.content, "base64")
          if (buf.byteLength > MAX_ATTACHMENT_BYTES) {
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              `Attachment "${att.filename}" exceeds the 25 MB size limit`
            )
          }
          return { data: buf, filename: att.filename }
        }
      )
    }

    try {
      const client = await this.initializeClient_()
      const result = await client.messages.create(
        this.domain_,
        messagePayload as any
      )

      return { id: result.id || result.message }
    } catch (error: any) {
      // Re-throw validation errors (INVALID_DATA) as-is — they are safe to surface
      if (error instanceof MedusaError && error.type === MedusaError.Types.INVALID_DATA) {
        throw error
      }
      // Log the full Mailgun error server-side; return only a generic message to callers
      const corrId = Math.random().toString(36).slice(2, 10)
      console.error(`[mailgun-service][${corrId}] send() failed:`, error)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Mailgun send failed (ref: ${corrId})`
      )
    }
  }

  async getTemplates(): Promise<string[]> {
    try {
      const client = await this.initializeClient_()
      const result = await client.domains.domainTemplates.list(this.domain_)
      return (result?.items ?? []).map((t: { name: string }) => t.name)
    } catch (error: any) {
      // Log the full Mailgun error server-side; return only a generic message to callers
      const corrId = Math.random().toString(36).slice(2, 10)
      console.error(`[mailgun-service][${corrId}] getTemplates() failed:`, error)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Mailgun templates fetch failed (ref: ${corrId})`
      )
    }
  }
}

export default MailgunNotificationProviderService
