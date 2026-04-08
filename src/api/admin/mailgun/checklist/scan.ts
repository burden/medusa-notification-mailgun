import * as fs from "fs"
import * as path from "path"
import * as ts from "typescript"

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
  inline_html_present: boolean
  inline_text_present: boolean
}

type FileMeta = {
  relPath: string
  content: string
  templates: Array<string | null> // null = dynamic (non-static) template expression
  hasInlineHtml: boolean
  hasInlineText: boolean
}

// Walks a source file's AST collecting every object-literal `template`, `html`,
// and `text` property value. Handles multi-handler files (multiple calls) and
// template literals (backticks without substitutions). Dynamic expressions are
// recorded as `null` so the rollup can mark them unverifiable.
function extractSubscriberMeta(source: string): {
  templates: Array<string | null>
  hasInlineHtml: boolean
  hasInlineText: boolean
} {
  const sf = ts.createSourceFile(
    "subscriber.ts",
    source,
    ts.ScriptTarget.Latest,
    true
  )

  const templates: Array<string | null> = []
  let hasInlineHtml = false
  let hasInlineText = false

  const readStaticString = (node: ts.Expression): string | null => {
    if (ts.isStringLiteral(node)) return node.text
    if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    return null
  }

  const isNonEmptyLiteral = (node: ts.Expression): boolean => {
    const s = readStaticString(node)
    if (s !== null) return s.length > 0
    // Any non-literal expression (variable, call, template literal with subs)
    // is assumed to potentially produce content.
    return true
  }

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        const name = prop.name
        const key = ts.isIdentifier(name)
          ? name.text
          : ts.isStringLiteral(name)
          ? name.text
          : null
        if (!key) continue

        if (key === "template") {
          templates.push(readStaticString(prop.initializer))
        } else if (key === "html") {
          if (isNonEmptyLiteral(prop.initializer)) hasInlineHtml = true
        } else if (key === "text") {
          if (isNonEmptyLiteral(prop.initializer)) hasInlineText = true
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  return { templates, hasInlineHtml, hasInlineText }
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
      inline_html_present: false,
      inline_text_present: false,
    }))
  }

  // Resolve real paths and assert subscribersDir is still under cwd (path traversal guard)
  const realCwd = fs.realpathSync(cwd)
  const realSubscribersDir = fs.realpathSync(subscribersDir)
  if (!realSubscribersDir.startsWith(realCwd + path.sep) && realSubscribersDir !== realCwd) {
    throw new Error("Subscribers directory is outside the project root")
  }

  const files = fs.readdirSync(realSubscribersDir).filter((f) => f.endsWith(".ts"))

  const fileMetas: FileMeta[] = files.flatMap((f) => {
    const filePath = path.join(realSubscribersDir, f)
    // Assert each resolved file path stays inside subscribersDir before reading
    const realFilePath = fs.realpathSync(filePath)
    if (!realFilePath.startsWith(realSubscribersDir + path.sep)) {
      return []
    }
    const content = fs.readFileSync(filePath, "utf-8")
    const meta = extractSubscriberMeta(content)
    return [{
      relPath: path.relative(cwd, filePath),
      content,
      templates: meta.templates,
      hasInlineHtml: meta.hasInlineHtml,
      hasInlineText: meta.hasInlineText,
    }]
  })

  return eventMap.map((cfg) => {
    // File→event association still happens by scanning file text for the event
    // string. AST-walking `config = { event: "..." }` would be more precise, but
    // the string-match is already sufficient to route each event to its handler.
    const eventPattern = new RegExp(`["']${cfg.event.replace(/\./g, "\\.")}["']`)

    const match = fileMetas.find((fm) => eventPattern.test(fm.content))

    if (!match) {
      return {
        event: cfg.event,
        expected_template: cfg.expected_template,
        subscriber_file: null,
        subscriber_found: false,
        template_name_in_subscriber: null,
        inline_html_present: false,
        inline_text_present: false,
      }
    }

    // Prefer a template literal matching the expected name; otherwise the first
    // resolvable (static) template. Dynamic-only entries leave this null so the
    // rollup can surface "unverified".
    const staticTemplates = match.templates.filter((t): t is string => t !== null)
    const templateName =
      staticTemplates.find((t) => t === cfg.expected_template) ??
      staticTemplates[0] ??
      null

    return {
      event: cfg.event,
      expected_template: cfg.expected_template,
      subscriber_file: match.relPath,
      subscriber_found: true,
      template_name_in_subscriber: templateName,
      inline_html_present: match.hasInlineHtml,
      inline_text_present: match.hasInlineText,
    }
  })
}
