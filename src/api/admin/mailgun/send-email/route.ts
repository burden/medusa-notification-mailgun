import { MedusaError, Modules } from "@medusajs/framework/utils"
import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { PostAdminMailgunTestSchema } from "./middlewares"

type PostBody = z.infer<typeof PostAdminMailgunTestSchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const { to, subject, template, from, data } = req.validatedBody

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
        ...(!template && !data?.html && !data?.text ? { text: `Test email — subject: ${subject}` } : {}),
      },
      ...(from ? { from } : {}),
    })

    res.json({ success: true, notification_id: result?.id || result })
  } catch (error: any) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Failed to send test email: ${error?.message || "Unknown error"}`
    )
  }
}
