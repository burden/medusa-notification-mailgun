import * as fs from "fs"
import * as path from "path"

export type EventCheckConfig = {
  event: string
  expected_template: string
}

export const EVENT_MAP: EventCheckConfig[] = [
  { event: "order.placed",               expected_template: "order-confirmation"    },
  { event: "order.canceled",             expected_template: "order-canceled"        },
  { event: "order.fulfillment_created",  expected_template: "order-shipped"         },
  { event: "shipment.created",           expected_template: "shipment-notification" },
  { event: "delivery.created",           expected_template: "order-delivered"       },
  { event: "order.return_requested",     expected_template: "return-confirmed"      },
  { event: "order.return_received",      expected_template: "return-received"       },
  { event: "order.exchange_created",     expected_template: "exchange-created"      },
  { event: "auth.password_reset",        expected_template: "password-reset"        },
  { event: "customer.created",           expected_template: "welcome"               },
  { event: "invite.created",             expected_template: "admin-invite"          },
  { event: "invite.resent",              expected_template: "admin-invite"          },
]

export type SubscriberScanResult = {
  event: string
  expected_template: string
  subscriber_file: string | null
  subscriber_found: boolean
  template_name_in_subscriber: string | null
}

export function scanSubscribers(cwd: string, eventMap: EventCheckConfig[]): SubscriberScanResult[] {
  const subscribersDir = path.join(cwd, "src", "subscribers")

  if (!fs.existsSync(subscribersDir)) {
    return eventMap.map((cfg) => ({
      event: cfg.event,
      expected_template: cfg.expected_template,
      subscriber_file: null,
      subscriber_found: false,
      template_name_in_subscriber: null,
    }))
  }

  // Resolve real paths and assert subscribersDir is still under cwd (path traversal guard)
  const realCwd = fs.realpathSync(cwd)
  const realSubscribersDir = fs.realpathSync(subscribersDir)
  if (!realSubscribersDir.startsWith(realCwd + path.sep) && realSubscribersDir !== realCwd) {
    throw new Error("Subscribers directory is outside the project root")
  }

  const files = fs.readdirSync(realSubscribersDir).filter((f) => f.endsWith(".ts"))

  const fileContents: Array<{ relPath: string; content: string }> = files.flatMap((f) => {
    const filePath = path.join(realSubscribersDir, f)
    // Assert each resolved file path stays inside subscribersDir before reading
    const realFilePath = fs.realpathSync(filePath)
    if (!realFilePath.startsWith(realSubscribersDir + path.sep)) {
      return []
    }
    return [{
      relPath: path.relative(cwd, filePath),
      content: fs.readFileSync(filePath, "utf-8"),
    }]
  })

  // Extracts the first static string value assigned to a `template` key in the file.
  // Matches patterns like: template: "my-template" or template: 'my-template'
  const templateValuePattern = /\btemplate\s*:\s*["']([^"']+)["']/

  return eventMap.map((cfg) => {
    const eventPattern = new RegExp(`["']${cfg.event.replace(/\./g, "\\.")}["']`)

    const match = fileContents.find((fc) => eventPattern.test(fc.content))

    if (!match) {
      return {
        event: cfg.event,
        expected_template: cfg.expected_template,
        subscriber_file: null,
        subscriber_found: false,
        template_name_in_subscriber: null,
      }
    }

    const templateMatch = templateValuePattern.exec(match.content)

    return {
      event: cfg.event,
      expected_template: cfg.expected_template,
      subscriber_file: match.relPath,
      subscriber_found: true,
      template_name_in_subscriber: templateMatch ? templateMatch[1] : null,
    }
  })
}
