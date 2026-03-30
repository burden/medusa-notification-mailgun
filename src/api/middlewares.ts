import { defineMiddlewares } from "@medusajs/framework/http"
import { mailgunTestMiddlewares } from "./admin/mailgun/send-email/middlewares"

export default defineMiddlewares([
  ...mailgunTestMiddlewares,
])
