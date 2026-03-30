import { z } from "zod"
import { validateAndTransformBody } from "@medusajs/framework/http"
import { MiddlewareRoute } from "@medusajs/framework/http"

export const PostAdminMailgunTestSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  template: z.string().optional(),
  from: z.string().email().optional(),
  data: z.record(z.string()).optional(),
})

export const mailgunTestMiddlewares: MiddlewareRoute[] = [
  {
    method: ["POST"],
    matcher: "/admin/mailgun/send-email",
    middlewares: [validateAndTransformBody(PostAdminMailgunTestSchema)],
  },
]
