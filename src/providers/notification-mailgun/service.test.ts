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
  })

  describe("error handling", () => {
    it("wraps Mailgun errors in MedusaError", async () => {
      mockCreate.mockRejectedValue(new Error("API rate limited"))
      const service = createService()

      await expect(
        service.send({
          to: "user@example.com",
          channel: "email",
          data: { subject: "Test", text: "hi" },
        } as any)
      ).rejects.toThrow("Mailgun send failed: API rate limited")
    })

    it("handles errors with details property", async () => {
      mockCreate.mockRejectedValue({ details: "Invalid domain" })
      const service = createService()

      await expect(
        service.send({
          to: "user@example.com",
          channel: "email",
          data: { subject: "Test", text: "hi" },
        } as any)
      ).rejects.toThrow("Mailgun send failed: Invalid domain")
    })

    it("handles unknown errors", async () => {
      mockCreate.mockRejectedValue({})
      const service = createService()

      await expect(
        service.send({
          to: "user@example.com",
          channel: "email",
          data: { subject: "Test", text: "hi" },
        } as any)
      ).rejects.toThrow("Mailgun send failed: Unknown Mailgun error")
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

  it("wraps API errors in MedusaError", async () => {
    mockListTemplates.mockRejectedValue(new Error("Unauthorized"))
    const service = createService()

    await expect(service.getTemplates()).rejects.toThrow(
      "Mailgun templates fetch failed: Unauthorized"
    )
  })

  it("handles errors with no message property", async () => {
    mockListTemplates.mockRejectedValue({})
    const service = createService()

    await expect(service.getTemplates()).rejects.toThrow(
      "Mailgun templates fetch failed: Unknown error"
    )
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
