import { MedusaError } from "@medusajs/framework/utils"
import MailgunNotificationProviderService from "./service"
import type { MailgunOptions } from "./service"

const mockCreate = jest.fn()
const mockListTemplates = jest.fn()

jest.mock("mailgun.js", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      client: jest.fn().mockReturnValue({
        messages: { create: mockCreate },
        domains: { domainTemplates: { list: mockListTemplates } },
      }),
    })),
  }
})

const defaultOptions: MailgunOptions = {
  api_key: "test-key-123",
  domain: "mail.example.com",
  from: "sender@example.com",
  region: "us",
}

function createService(opts: MailgunOptions = defaultOptions) {
  return new MailgunNotificationProviderService({}, opts)
}

beforeEach(() => {
  mockCreate.mockReset()
  mockListTemplates.mockReset()
})

describe("validateOptions", () => {
  it("throws when api_key is missing", () => {
    expect(() =>
      MailgunNotificationProviderService.validateOptions({ domain: "x" })
    ).toThrow("MAILGUN_API_KEY is required")
  })

  it("throws when domain is missing", () => {
    expect(() =>
      MailgunNotificationProviderService.validateOptions({ api_key: "x" })
    ).toThrow("MAILGUN_DOMAIN is required")
  })

  it("passes with valid options", () => {
    expect(() =>
      MailgunNotificationProviderService.validateOptions({
        api_key: "x",
        domain: "y",
      })
    ).not.toThrow()
  })

  it("throws when region is not in the allowlist", () => {
    expect(() =>
      MailgunNotificationProviderService.validateOptions({
        api_key: "x",
        domain: "y",
        region: "cn",
      })
    ).toThrow("MAILGUN_REGION must be 'us' or 'eu'")
  })

  it("passes when region is 'us'", () => {
    expect(() =>
      MailgunNotificationProviderService.validateOptions({
        api_key: "x",
        domain: "y",
        region: "us",
      })
    ).not.toThrow()
  })

  it("passes when region is 'eu'", () => {
    expect(() =>
      MailgunNotificationProviderService.validateOptions({
        api_key: "x",
        domain: "y",
        region: "eu",
      })
    ).not.toThrow()
  })

  it("passes when region is omitted", () => {
    expect(() =>
      MailgunNotificationProviderService.validateOptions({
        api_key: "x",
        domain: "y",
      })
    ).not.toThrow()
  })
})

describe("send", () => {
  it("throws when 'to' is missing", async () => {
    const service = createService()
    await expect(
      service.send({ to: "", channel: "email", template: null, data: {} } as any)
    ).rejects.toThrow("Recipient email address (to) is required")
  })

  describe("template path", () => {
    it("sets template and X-Mailgun-Variables", async () => {
      mockCreate.mockResolvedValue({ id: "msg-1" })
      const service = createService()

      await service.send({
        to: "user@example.com",
        channel: "email",
        template: "welcome",
        data: { subject: "Hi", name: "Alice" },
      } as any)

      expect(mockCreate).toHaveBeenCalledWith(
        "mail.example.com",
        expect.objectContaining({
          template: "welcome",
          "h:X-Mailgun-Variables": JSON.stringify({
            subject: "Hi",
            name: "Alice",
          }),
        })
      )
    })

    it("sets t:version when locale is provided", async () => {
      mockCreate.mockResolvedValue({ id: "msg-2" })
      const service = createService()

      await service.send({
        to: "user@example.com",
        channel: "email",
        template: "welcome",
        data: { subject: "Bonjour", locale: "fr" },
      } as any)

      expect(mockCreate).toHaveBeenCalledWith(
        "mail.example.com",
        expect.objectContaining({
          template: "welcome",
          "t:version": "fr",
        })
      )
    })

    it("omits t:version when locale is not provided", async () => {
      mockCreate.mockResolvedValue({ id: "msg-3" })
      const service = createService()

      await service.send({
        to: "user@example.com",
        channel: "email",
        template: "welcome",
        data: { subject: "Hello" },
      } as any)

      const payload = mockCreate.mock.calls[0][1]
      expect(payload["t:version"]).toBeUndefined()
    })
  })

  describe("HTML path", () => {
    it("sends html when no template is set", async () => {
      mockCreate.mockResolvedValue({ id: "msg-4" })
      const service = createService()

      await service.send({
        to: "user@example.com",
        channel: "email",
        data: { subject: "Test", html: "<h1>Hello</h1>" },
      } as any)

      expect(mockCreate).toHaveBeenCalledWith(
        "mail.example.com",
        expect.objectContaining({
          html: "<h1>Hello</h1>",
        })
      )
    })
  })

  describe("text path", () => {
    it("sends text when no template or html is set", async () => {
      mockCreate.mockResolvedValue({ id: "msg-5" })
      const service = createService()

      await service.send({
        to: "user@example.com",
        channel: "email",
        data: { subject: "Test", text: "Hello plain" },
      } as any)

      expect(mockCreate).toHaveBeenCalledWith(
        "mail.example.com",
        expect.objectContaining({
          text: "Hello plain",
        })
      )
    })
  })

  describe("fallback path", () => {
    it("JSON-stringifies data when no template, html, or text", async () => {
      mockCreate.mockResolvedValue({ id: "msg-6" })
      const service = createService()
      const data = { subject: "Test", order_id: "ord_1" }

      await service.send({
        to: "user@example.com",
        channel: "email",
        data,
      } as any)

      expect(mockCreate).toHaveBeenCalledWith(
        "mail.example.com",
        expect.objectContaining({
          text: JSON.stringify(data, null, 2),
        })
      )
    })
  })

  describe("sender", () => {
    it("uses configured from address", async () => {
      mockCreate.mockResolvedValue({ id: "msg-7" })
      const service = createService()

      await service.send({
        to: "user@example.com",
        channel: "email",
        data: { subject: "Test", text: "hi" },
      } as any)

      expect(mockCreate).toHaveBeenCalledWith(
        "mail.example.com",
        expect.objectContaining({ from: "sender@example.com" })
      )
    })

    it("uses data.from when provided (overrides configured from)", async () => {
      mockCreate.mockResolvedValue({ id: "msg-8b" })
      const service = createService()

      await service.send({
        to: "user@example.com",
        channel: "email",
        data: { subject: "Test", text: "hi", from: "store@mystore.co.uk" },
      } as any)

      expect(mockCreate).toHaveBeenCalledWith(
        "mail.example.com",
        expect.objectContaining({ from: "store@mystore.co.uk" })
      )
    })

    it("defaults from to noreply@domain when not configured", async () => {
      mockCreate.mockResolvedValue({ id: "msg-8" })
      const service = createService({
        api_key: "k",
        domain: "mail.example.com",
      })

      await service.send({
        to: "user@example.com",
        channel: "email",
        data: { subject: "Test", text: "hi" },
      } as any)

      expect(mockCreate).toHaveBeenCalledWith(
        "mail.example.com",
        expect.objectContaining({ from: "noreply@mail.example.com" })
      )
    })
  })

  describe("subject", () => {
    it("uses data.subject", async () => {
      mockCreate.mockResolvedValue({ id: "msg-9" })
      const service = createService()

      await service.send({
        to: "user@example.com",
        channel: "email",
        data: { subject: "Custom Subject", text: "hi" },
      } as any)

      expect(mockCreate).toHaveBeenCalledWith(
        "mail.example.com",
        expect.objectContaining({ subject: "Custom Subject" })
      )
    })

    it("defaults subject to 'Notification'", async () => {
      mockCreate.mockResolvedValue({ id: "msg-10" })
      const service = createService()

      await service.send({
        to: "user@example.com",
        channel: "email",
        data: { text: "hi" },
      } as any)

      expect(mockCreate).toHaveBeenCalledWith(
        "mail.example.com",
        expect.objectContaining({ subject: "Notification" })
      )
    })
  })

  describe("attachments", () => {
    it("decodes base64 attachments", async () => {
      mockCreate.mockResolvedValue({ id: "msg-11" })
      const service = createService()
      const content = Buffer.from("hello").toString("base64")

      await service.send({
        to: "user@example.com",
        channel: "email",
        data: { subject: "Test", text: "hi" },
        attachments: [{ content, filename: "hello.txt" }],
      } as any)

      const payload = mockCreate.mock.calls[0][1]
      expect(payload.attachment).toHaveLength(1)
      expect(payload.attachment[0].filename).toBe("hello.txt")
      expect(payload.attachment[0].data).toEqual(Buffer.from("hello"))
    })

    it("rejects filenames with path traversal characters", async () => {
      const service = createService()
      const content = Buffer.from("data").toString("base64")

      await expect(
        service.send({
          to: "user@example.com",
          channel: "email",
          data: { subject: "Test", text: "hi" },
          attachments: [{ content, filename: "../../etc/passwd" }],
        } as any)
      ).rejects.toThrow("invalid characters")
    })

    it("rejects filenames with null bytes", async () => {
      const service = createService()
      const content = Buffer.from("data").toString("base64")

      await expect(
        service.send({
          to: "user@example.com",
          channel: "email",
          data: { subject: "Test", text: "hi" },
          attachments: [{ content, filename: "file\x00.txt" }],
        } as any)
      ).rejects.toThrow("invalid characters")
    })

    it("rejects attachments exceeding 25 MB", async () => {
      const service = createService()
      // Create a buffer slightly over 25 MB and base64-encode it
      const bigBuf = Buffer.alloc(25 * 1024 * 1024 + 1)
      const content = bigBuf.toString("base64")

      await expect(
        service.send({
          to: "user@example.com",
          channel: "email",
          data: { subject: "Test", text: "hi" },
          attachments: [{ content, filename: "big.bin" }],
        } as any)
      ).rejects.toThrow("exceeds the 25 MB size limit")
    })

    it("accepts attachments exactly at the 25 MB limit", async () => {
      mockCreate.mockResolvedValue({ id: "msg-attach-ok" })
      const service = createService()
      const exactBuf = Buffer.alloc(25 * 1024 * 1024)
      const content = exactBuf.toString("base64")

      await expect(
        service.send({
          to: "user@example.com",
          channel: "email",
          data: { subject: "Test", text: "hi" },
          attachments: [{ content, filename: "exact.bin" }],
        } as any)
      ).resolves.toBeDefined()
    })
  })

  describe("error handling", () => {
    it("does not leak internal error details in the thrown message", async () => {
      mockCreate.mockRejectedValue(new Error("domain mail.secret-internal.com is suspended"))
      const service = createService()

      const thrown = await service.send({
        to: "user@example.com",
        channel: "email",
        data: { subject: "Test", text: "hi" },
      } as any).catch((e) => e)

      expect(thrown).toBeInstanceOf(MedusaError)
      // The raw internal error detail must not appear in the client-facing message
      expect(thrown.message).not.toContain("secret-internal.com")
      expect(thrown.message).not.toContain("suspended")
      // Must include a correlation reference for support lookup
      expect(thrown.message).toMatch(/ref: [a-z0-9]+/)
    })

    it("re-throws INVALID_DATA errors without wrapping (safe validation errors)", async () => {
      const service = createService()

      // Trigger a known INVALID_DATA path (data size limit)
      const bigData = { subject: "x", payload: "x".repeat(33 * 1024) }
      await expect(
        service.send({
          to: "user@example.com",
          channel: "email",
          template: "welcome",
          data: bigData,
        } as any)
      ).rejects.toThrow("exceeds the 32 KB size limit")
    })

    it("handles unknown errors", async () => {
      mockCreate.mockRejectedValue({})
      const service = createService()

      const thrown = await service.send({
        to: "user@example.com",
        channel: "email",
        data: { subject: "Test", text: "hi" },
      } as any).catch((e) => e)

      expect(thrown).toBeInstanceOf(MedusaError)
      expect(thrown.message).toMatch(/Mailgun send failed \(ref: [a-z0-9]+\)/)
    })
  })

  describe("data size limit", () => {
    it("throws when serialized data exceeds 32 KB", async () => {
      const service = createService()
      const bigData = { subject: "x", payload: "x".repeat(33 * 1024) }

      await expect(
        service.send({
          to: "user@example.com",
          channel: "email",
          template: "welcome",
          data: bigData,
        } as any)
      ).rejects.toThrow("exceeds the 32 KB size limit")
    })

    it("does not throw when serialized data is just under the limit", async () => {
      mockCreate.mockResolvedValue({ id: "msg-size-ok" })
      const service = createService()
      // Build a data object whose JSON serialization stays under 32 KB.
      // JSON.stringify({ subject: "x", p: "<padding>" }) adds ~18 bytes of overhead.
      const padding = "x".repeat(32 * 1024 - 30)
      const data = { subject: "x", p: padding }

      await expect(
        service.send({
          to: "user@example.com",
          channel: "email",
          template: "welcome",
          data,
        } as any)
      ).resolves.toBeDefined()
    })
  })

  describe("return value", () => {
    it("returns message id", async () => {
      mockCreate.mockResolvedValue({ id: "<abc@mail.example.com>" })
      const service = createService()

      const result = await service.send({
        to: "user@example.com",
        channel: "email",
        data: { subject: "Test", text: "hi" },
      } as any)

      expect(result).toEqual({ id: "<abc@mail.example.com>" })
    })

    it("falls back to message field", async () => {
      mockCreate.mockResolvedValue({ message: "Queued" })
      const service = createService()

      const result = await service.send({
        to: "user@example.com",
        channel: "email",
        data: { subject: "Test", text: "hi" },
      } as any)

      expect(result).toEqual({ id: "Queued" })
    })
  })

  describe("getTemplates", () => {
  it("returns template names from items array", async () => {
    mockListTemplates.mockResolvedValue({
      items: [{ name: "welcome" }, { name: "order-confirmation" }],
    })
    const service = createService()

    const result = await service.getTemplates()

    expect(mockListTemplates).toHaveBeenCalledWith("mail.example.com")
    expect(result).toEqual(["welcome", "order-confirmation"])
  })

  it("returns empty array when items is empty", async () => {
    mockListTemplates.mockResolvedValue({ items: [] })
    const service = createService()

    const result = await service.getTemplates()

    expect(result).toEqual([])
  })

  it("returns empty array when items key is absent", async () => {
    mockListTemplates.mockResolvedValue({})
    const service = createService()

    const result = await service.getTemplates()

    expect(result).toEqual([])
  })

  it("wraps API errors in MedusaError with sanitized message", async () => {
    mockListTemplates.mockRejectedValue(new Error("Unauthorized: key=secret-key-abc"))
    const service = createService()

    const thrown = await service.getTemplates().catch((e) => e)
    expect(thrown).toBeInstanceOf(MedusaError)
    // Must not leak internal detail
    expect(thrown.message).not.toContain("secret-key-abc")
    expect(thrown.message).toMatch(/ref: [a-z0-9]+/)
  })

  it("handles errors with no message property and returns sanitized message", async () => {
    mockListTemplates.mockRejectedValue({})
    const service = createService()

    const thrown = await service.getTemplates().catch((e) => e)
    expect(thrown).toBeInstanceOf(MedusaError)
    expect(thrown.message).toMatch(/Mailgun templates fetch failed \(ref: [a-z0-9]+\)/)
  })
})

describe("EU region", () => {
    it("initializes client with EU endpoint", async () => {
      mockCreate.mockResolvedValue({ id: "msg-eu" })
      const { default: Mailgun } = await import("mailgun.js")
      const mockConstructor = Mailgun as unknown as jest.Mock
      mockConstructor.mockClear()

      const service = createService({ ...defaultOptions, region: "eu" })

      await service.send({
        to: "user@example.com",
        channel: "email",
        data: { subject: "Test", text: "hi" },
      } as any)

      const mockMailgunInstance = mockConstructor.mock.results[0]?.value
      expect(mockMailgunInstance.client).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://api.eu.mailgun.net",
        })
      )
    })
  })
})
