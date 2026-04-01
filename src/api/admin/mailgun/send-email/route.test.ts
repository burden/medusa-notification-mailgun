import { MedusaError } from "@medusajs/framework/utils"
import { POST } from "./route"

function makeRes() {
  return { json: jest.fn() } as any
}

const mockCreateNotifications = jest.fn()
const mockListUsers = jest.fn()

const mockNotificationService = {
  createNotifications: mockCreateNotifications,
}

const mockUserService = {
  listUsers: mockListUsers,
}

function makeReqWithScope(body: Record<string, unknown>) {
  return {
    validatedBody: body,
    scope: {
      resolve: jest.fn().mockImplementation((module: string) => {
        if (module === "user") return mockUserService
        return mockNotificationService
      }),
    },
  } as any
}

beforeEach(() => {
  mockCreateNotifications.mockReset()
  mockListUsers.mockReset()
  mockListUsers.mockResolvedValue([{ id: "user-1", email: "user@example.com" }])
})

describe("POST /admin/mailgun/test", () => {
  describe("success", () => {
    it("calls createNotifications with correct shape", async () => {
      mockCreateNotifications.mockResolvedValue({ id: "notif-1" })
      const req = makeReqWithScope({ to: "user@example.com", subject: "Hello", data: { name: "Alice" }, template: "welcome" })
      const res = makeRes()

      await POST(req, res)

      expect(mockCreateNotifications).toHaveBeenCalledWith({
        to: "user@example.com",
        channel: "email",
        template: "welcome",
        data: { name: "Alice", subject: "Hello" },
      })
    })

    it("returns success with notification_id", async () => {
      mockCreateNotifications.mockResolvedValue({ id: "notif-2" })
      const req = makeReqWithScope({ to: "user@example.com", subject: "Hi", template: "t1" })
      const res = makeRes()

      await POST(req, res)

      expect(res.json).toHaveBeenCalledWith({ success: true, notification_id: "notif-2" })
    })

    it("falls back to result itself when no .id on response", async () => {
      mockCreateNotifications.mockResolvedValue("raw-result")
      const req = makeReqWithScope({ to: "user@example.com", subject: "Hi", template: "t1" })
      const res = makeRes()

      await POST(req, res)

      expect(res.json).toHaveBeenCalledWith({ success: true, notification_id: "raw-result" })
    })

    it("uses __inline__ template when none provided", async () => {
      mockCreateNotifications.mockResolvedValue({ id: "notif-3" })
      const req = makeReqWithScope({ to: "user@example.com", subject: "No template" })
      const res = makeRes()

      await POST(req, res)

      expect(mockCreateNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ template: "__inline__" })
      )
    })

    it("injects fallback text when no template, html, or text", async () => {
      mockCreateNotifications.mockResolvedValue({ id: "notif-4" })
      const req = makeReqWithScope({ to: "user@example.com", subject: "Fallback" })
      const res = makeRes()

      await POST(req, res)

      expect(mockCreateNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ text: "Test email — subject: Fallback" }),
        })
      )
    })

    it("injects generic fallback text when no template, html, text, or subject", async () => {
      mockCreateNotifications.mockResolvedValue({ id: "notif-4b" })
      const req = makeReqWithScope({ to: "user@example.com" })
      const res = makeRes()

      await POST(req, res)

      expect(mockCreateNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ text: "Test email" }),
        })
      )
    })

    it("does not inject fallback text when template is provided", async () => {
      mockCreateNotifications.mockResolvedValue({ id: "notif-5" })
      const req = makeReqWithScope({ to: "user@example.com", subject: "With template", template: "my-tpl" })
      const res = makeRes()

      await POST(req, res)

      const payload = mockCreateNotifications.mock.calls[0][0]
      expect(payload.data.text).toBeUndefined()
    })

    it("includes from when provided", async () => {
      mockCreateNotifications.mockResolvedValue({ id: "notif-6" })
      const req = makeReqWithScope({ to: "user@example.com", subject: "Hi", from: "custom@sender.com", template: "t1" })
      const res = makeRes()

      await POST(req, res)

      expect(mockCreateNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ from: "custom@sender.com" })
      )
    })

    it("omits from when not provided", async () => {
      mockCreateNotifications.mockResolvedValue({ id: "notif-7" })
      const req = makeReqWithScope({ to: "user@example.com", subject: "Hi", template: "t1" })
      const res = makeRes()

      await POST(req, res)

      const payload = mockCreateNotifications.mock.calls[0][0]
      expect(payload.from).toBeUndefined()
    })
  })

  describe("error handling", () => {
    it("wraps notification service errors in sanitized MedusaError with correlation ID", async () => {
      mockCreateNotifications.mockRejectedValue(new Error("Provider unavailable"))
      const req = makeReqWithScope({ to: "user@example.com", subject: "Hi", template: "t1" })
      const res = makeRes()
      const consoleSpy = jest.spyOn(console, "error").mockImplementation()

      await expect(POST(req, res)).rejects.toThrow(/^Failed to send test email \(ref: [a-z0-9]+\)$/)
      consoleSpy.mockRestore()
    })

    it("throws MedusaError of type UNEXPECTED_STATE", async () => {
      mockCreateNotifications.mockRejectedValue(new Error("oops"))
      const req = makeReqWithScope({ to: "user@example.com", subject: "Hi", template: "t1" })
      const res = makeRes()
      const consoleSpy = jest.spyOn(console, "error").mockImplementation()

      await expect(POST(req, res)).rejects.toBeInstanceOf(MedusaError)
      consoleSpy.mockRestore()
    })

    it("logs the original error server-side but does not expose it to the client", async () => {
      const originalError = new Error("Provider unavailable")
      mockCreateNotifications.mockRejectedValue(originalError)
      const req = makeReqWithScope({ to: "user@example.com", subject: "Hi", template: "t1" })
      const res = makeRes()
      const consoleSpy = jest.spyOn(console, "error").mockImplementation()

      await expect(POST(req, res)).rejects.toThrow(/Failed to send test email \(ref:/)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[mailgun] test send failed"), originalError)
      consoleSpy.mockRestore()
    })

    it("handles errors without a message", async () => {
      mockCreateNotifications.mockRejectedValue({})
      const req = makeReqWithScope({ to: "user@example.com", subject: "Hi", template: "t1" })
      const res = makeRes()
      const consoleSpy = jest.spyOn(console, "error").mockImplementation()

      await expect(POST(req, res)).rejects.toThrow(/^Failed to send test email \(ref: [a-z0-9]+\)$/)
      consoleSpy.mockRestore()
    })
  })
})
