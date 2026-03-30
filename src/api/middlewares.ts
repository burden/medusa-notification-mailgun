import { defineMiddlewares } from "@medusajs/framework/http"
import { mailgunTestMiddlewares } from "./admin/mailgun/test/middlewares"

export default defineMiddlewares([
  ...mailgunTestMiddlewares,
])
