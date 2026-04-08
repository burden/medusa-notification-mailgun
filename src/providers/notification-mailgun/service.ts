import {
  AbstractNotificationProviderService,
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { randomUUID } from "crypto"
import type { Interfaces } from "mailgun.js/definitions" with { "resolution-mode": "import" }
type IMailgunClient = Interfaces.IMailgunClient
import { createMailgunClient } from "../../modules/mailgun/client"

export type MailgunOptions = {
  api_key: string
  domain: string
  from?: string
  region?: "us" | "eu"
}

/**
 * Local extension of `ProviderSendNotificationDTO` covering the optional
 * `from` and `attachments` fields the Mailgun provider accepts. The framework
 * DTO doesn't model these, but rather than scattering `(notification as any)`
 * casts through the body of `send()`, we narrow once at the entry point.
 */
type MailgunAttachment = { content: string; filename: string }
type MailgunNotificationDTO = ProviderSendNotificationDTO & {
  from?: string
  attachments?: MailgunAttachment[]
}

function toMailgunDTO(
  notification: ProviderSendNotificationDTO
): MailgunNotificationDTO {
  return notification as MailgunNotificationDTO
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

  private clientPromise_?: Promise<IMailgunClient>
  private domain_: string
  private from_: string
  private options_: MailgunOptions
  private logger_: Logger

  constructor(
    container: Record<string, unknown>,
    options: MailgunOptions
  ) {
    super()

    this.options_ = options
    this.domain_ = options.domain
    this.from_ = options.from || `noreply@${options.domain}`
    this.logger_ = resolveLogger(container)
  }

  private async initializeClient_(): Promise<IMailgunClient> {
    // Memoize the in-flight promise so concurrent cold-start callers share one
    // dynamic import + client construction. On failure, clear the cache so the
    // next caller retries rather than permanently reusing a rejected promise.
    if (this.clientPromise_) {
      return this.clientPromise_
    }
    this.clientPromise_ = createMailgunClient({
      api_key: this.options_.api_key,
      region: this.options_.region,
    }).catch((err) => {
      this.clientPromise_ = undefined
      throw err
    })
    return this.clientPromise_
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const dto = toMailgunDTO(notification)
    const { to, template, data } = dto

    if (!to) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Recipient email address (to) is required"
      )
    }

    const messagePayload: Record<string, unknown> = {
      from: dto.from?.trim() || (data?.from as string)?.trim() || this.from_,
      to: [to],
    }

    const subject = (data?.subject as string)?.trim()
    if (subject) {
      messagePayload.subject = subject
    }

    const replyTo = (data?.replyTo as string)?.trim()
    if (replyTo) {
      messagePayload["h:Reply-To"] = replyTo
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
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Notification must include a template, html, or text body"
      )
    }

    const attachments = dto.attachments
    if (attachments?.length) {
      // Validate each attachment filename and size before passing to Mailgun
      const SAFE_FILENAME = /^[\w\-. ]+$/
      const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25 MB per Mailgun's limit
      messagePayload.attachment = attachments.map((att) => {
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
      })
    }

    const corrId = newCorrelationId()
    try {
      const client = await this.initializeClient_()
      const result = await client.messages.create(
        this.domain_,
        messagePayload as any
      )

      return { id: (result as { id?: string; message?: string }).id || (result as { message?: string }).message || "" }
    } catch (error: unknown) {
      // Re-throw validation errors (INVALID_DATA) as-is — they are safe to surface
      if (error instanceof MedusaError && error.type === MedusaError.Types.INVALID_DATA) {
        throw error
      }
      // Log the full Mailgun error server-side; return only a generic message to callers
      this.logger_.error(`[mailgun-service][${corrId}] send() failed: ${formatError(error)}`)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Mailgun send failed (ref: ${corrId})`
      )
    }
  }

  async getTemplates(): Promise<string[]> {
    const corrId = newCorrelationId()
    try {
      const client = await this.initializeClient_()
      const result = await client.domains.domainTemplates.list(this.domain_)
      const items = (result as { items?: Array<{ name: string }> })?.items ?? []
      return items.map((t) => t.name)
    } catch (error: unknown) {
      // Log the full Mailgun error server-side; return only a generic message to callers
      this.logger_.error(`[mailgun-service][${corrId}] getTemplates() failed: ${formatError(error)}`)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Mailgun templates fetch failed (ref: ${corrId})`
      )
    }
  }
}

/**
 * Resolve the Medusa logger from the container; fall back to a console-backed
 * shim when the container hasn't registered one (e.g. unit tests, validate-only
 * usage). The shim conforms to the Logger interface for the call sites we use.
 */
function resolveLogger(container: Record<string, unknown>): Logger {
  const resolveFn = (container as { resolve?: (key: string) => unknown })?.resolve
  if (typeof resolveFn === "function") {
    try {
      const logger = resolveFn.call(container, ContainerRegistrationKeys.LOGGER)
      if (logger) return logger as Logger
    } catch {
      // fall through to console shim
    }
  }
  return consoleLogger
}

const consoleLogger: Logger = {
  panic: (data: unknown) => console.error(data),
  shouldLog: () => true,
  setLogLevel: () => {},
  unsetLogLevel: () => {},
  activity: () => "",
  progress: () => {},
  error: (msg: unknown) => console.error(msg),
  failure: (_a: unknown, msg: unknown) => console.error(msg),
  success: () => {},
  debug: (msg: unknown) => console.debug(msg),
  info: (msg: unknown) => console.info(msg),
  warn: (msg: unknown) => console.warn(msg),
  log: (...args: unknown[]) => console.log(...args),
} as unknown as Logger

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

export default MailgunNotificationProviderService
