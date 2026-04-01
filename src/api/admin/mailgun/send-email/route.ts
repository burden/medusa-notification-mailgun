import { MedusaError, Modules } from "@medusajs/framework/utils"
import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { PostAdminMailgunTestSchema } from "./middlewares"

type PostBody = z.infer<typeof PostAdminMailgunTestSchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const { to, subject, template, from, reply_to, data } = req.validatedBody

  // SECURITY NOTE (Finding #7 — User Enumeration):
  // This endpoint is admin-only (requires authentication). The error below confirms whether
  // an email address belongs to a registered admin. We accept this enumeration risk because:
  //   1. The endpoint requires a valid admin session — unauthenticated callers cannot reach it.
  //   2. The actionable error message is operationally valuable for admins debugging send failures.
  // If this endpoint is ever exposed more broadly, replace the error with a silent no-op.
  const userService = req.scope.resolve(Modules.USER) as any
  const matchingUsers = await userService.listUsers({ email: [to] })
  if (!matchingUsers || matchingUsers.length === 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Recipient must be a registered admin user email address"
    )
  }

  const notificationService = req.scope.resolve("notification")

  try {
    const result = await notificationService.createNotifications({
      to,
      channel: "email",
      template: template || "__inline__",
      data: {
        ...data,
        subject,
        ...(!template && !data?.html && !data?.text ? { text: subject ? `Test email — subject: ${subject}` : "Test email" } : {}),
      },
      ...(from ? { from } : {}),
      ...(reply_to ? { reply_to } : {}),
    })

    res.json({ success: true, notification_id: result?.id || result })
  } catch (error: any) {
    const corrId = Math.random().toString(36).slice(2, 10)
    console.error(`[mailgun] test send failed (ref: ${corrId})`, error)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Failed to send test email (ref: ${corrId})`
    )
  }
}
