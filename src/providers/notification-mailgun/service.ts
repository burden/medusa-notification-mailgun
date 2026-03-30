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
      from: (notification as any).from?.trim() || this.from_,
      to: [to],
      subject: (data?.subject as string) || "Notification",
    }

    if (template) {
      messagePayload.template = template
      messagePayload["h:X-Mailgun-Variables"] = JSON.stringify(data || {})
      if (data?.locale) {
        messagePayload["t:version"] = data.locale as string
      }
    } else if (data?.html) {
      messagePayload.html = data.html as string
    } else if (data?.text) {
      messagePayload.text = data.text as string
    } else {
      messagePayload.text = JSON.stringify(data, null, 2)
    }

    const attachments = (notification as any).attachments
    if (attachments?.length) {
      messagePayload.attachment = attachments.map(
        (att: { content: string; filename: string }) => ({
          data: Buffer.from(att.content, "base64"),
          filename: att.filename,
        })
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
      const message =
        error?.details || error?.message || "Unknown Mailgun error"
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Mailgun send failed: ${message}`
      )
    }
  }
}

export default MailgunNotificationProviderService
