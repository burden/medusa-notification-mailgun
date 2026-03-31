import { useState, useEffect } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Container,
  Heading,
  Text,
  Label,
  Input,
  Textarea,
  Select,
  Button,
  IconButton,
  toast,
  Tabs,
  Badge,
  Tooltip,
} from "@medusajs/ui"
import { EnvelopeSolid, PlusMini, Trash } from "@medusajs/icons"
import { sdk } from "../../lib/sdk"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VariableRow = { id: string; key: string; value: string }

interface ChecklistEvent {
  event: string
  expected_template: string
  subscriber_file: string | null
  subscriber_found: boolean
  template_name_in_subscriber: boolean
  template_exists_in_mailgun: boolean | null
  status: "pass" | "warn" | "inline" | "fail"
  hint?: string
}

interface ChecklistResponse {
  status: "pass" | "warn" | "fail"
  checked_at: string
  subscriber_root: string
  subscriber_root_found: boolean
  mailgun_templates_reachable: boolean
  mailgun_error?: string
  inline_count: number
  events: ChecklistEvent[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return "Checked just now"
  if (diffMins === 1) return "Checked 1 minute ago"
  return `Checked ${diffMins} minutes ago`
}

function absoluteTime(isoString: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(isoString))
}

// ---------------------------------------------------------------------------
// SendTestTab
// ---------------------------------------------------------------------------

const SendTestTab = () => {
  const [to, setTo] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [template, setTemplate] = useState("")
  const [from, setFrom] = useState("")
  const [variables, setVariables] = useState<VariableRow[]>([])
  const [errors, setErrors] = useState<{ to?: string; subject?: string }>({})

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => sdk.admin.user.list(),
  })

  const sendTest = useMutation({
    mutationFn: (payload: object) =>
      sdk.client.fetch("/admin/mailgun/send-email", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      toast.success("Test email sent successfully")
      setTo("")
      setSubject("")
      setBody("")
      setTemplate("")
      setFrom("")
      setVariables([])
      setErrors({})
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to send test email")
    },
  })

  const addVariable = () => {
    setVariables((v) => [...v, { id: crypto.randomUUID(), key: "", value: "" }])
  }

  const removeVariable = (id: string) => {
    setVariables((v) => v.filter((row) => row.id !== id))
  }

  const updateVariable = (id: string, field: "key" | "value", val: string) => {
    setVariables((v) =>
      v.map((row) => (row.id === id ? { ...row, [field]: val } : row))
    )
  }

  const handleSubmit = () => {
    const newErrors: typeof errors = {}
    if (!to) newErrors.to = "Please select a recipient"
    if (!subject.trim()) newErrors.subject = "Subject is required"

    if (Object.keys(newErrors).length) {
      setErrors(newErrors)
      return
    }
    setErrors({})

    const data = variables
      .filter((row) => row.key.trim())
      .reduce<Record<string, string>>((acc, row) => {
        acc[row.key.trim()] = row.value
        return acc
      }, {})

    if (body.trim()) {
      data.text = body.trim()
    }

    sendTest.mutate({
      to,
      subject: subject.trim(),
      ...(template.trim() ? { template: template.trim() } : {}),
      ...(from.trim() ? { from: from.trim() } : {}),
      ...(Object.keys(data).length ? { data } : {}),
    })
  }

  const userLabel = (u: {
    first_name?: string | null
    last_name?: string | null
    email: string
  }) => {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ")
    return name ? `${name} <${u.email}>` : u.email
  }

  return (
    <div className="flex flex-col gap-y-6">
      {/* Recipient */}
      <div className="flex flex-col gap-y-2">
        <Label htmlFor="to" size="small" weight="plus">
          Recipient *
        </Label>
        <Text size="small" className="text-ui-fg-subtle">
          Only registered admin users can be selected as recipients.
        </Text>
        <Select value={to} onValueChange={setTo} disabled={usersLoading}>
          <Select.Trigger id="to">
            <Select.Value
              placeholder={
                usersLoading ? "Loading users…" : "Select a recipient"
              }
            />
          </Select.Trigger>
          <Select.Content>
            {(usersData?.users ?? []).map((u) => (
              <Select.Item key={u.id} value={u.email}>
                {userLabel(u)}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        {errors.to && (
          <Text size="small" className="text-ui-fg-error">
            {errors.to}
          </Text>
        )}
      </div>

      {/* Subject */}
      <div className="flex flex-col gap-y-2">
        <Label htmlFor="subject" size="small" weight="plus">
          Subject *
        </Label>
        <Input
          id="subject"
          type="text"
          placeholder="Test email subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        {errors.subject && (
          <Text size="small" className="text-ui-fg-error">
            {errors.subject}
          </Text>
        )}
      </div>

      {/* Message body */}
      <div className="flex flex-col gap-y-2">
        <Label htmlFor="body" size="small" weight="plus">
          Message body
        </Label>
        <Text size="small" className="text-ui-fg-subtle">
          Optional. Plain-text body used when no Mailgun template is specified.
          If both are left blank, a default test message is sent automatically.
        </Text>
        <Textarea
          id="body"
          placeholder="Enter message body…"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="resize-y"
        />
      </div>

      {/* Template */}
      <div className="flex flex-col gap-y-2">
        <Label htmlFor="template" size="small" weight="plus">
          Template name
        </Label>
        <Text size="small" className="text-ui-fg-subtle">
          Optional. Must match a template name in your Mailgun account. If left
          blank, the message body above (or an auto-generated test message) is
          used instead.
        </Text>
        <Input
          id="template"
          type="text"
          placeholder="my-template-name"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        />
      </div>

      {/* From override */}
      <div className="flex flex-col gap-y-2">
        <Label htmlFor="from" size="small" weight="plus">
          From address
        </Label>
        <Text size="small" className="text-ui-fg-subtle">
          Optional. When left blank, the sender address configured in the
          plugin (<code>MAILGUN_FROM</code>) is used.
        </Text>
        <Input
          id="from"
          type="email"
          placeholder="sender@example.com"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </div>

      {/* Template variables */}
      <div className="flex flex-col gap-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label size="small" weight="plus">
              Template variables
            </Label>
            <Text size="small" className="text-ui-fg-subtle">
              Key-value pairs passed as template variables to Mailgun.
            </Text>
          </div>
          <IconButton
            size="small"
            variant="transparent"
            onClick={addVariable}
            title="Add variable"
          >
            <PlusMini />
          </IconButton>
        </div>

        {variables.length === 0 && (
          <Text size="small" className="text-ui-fg-muted italic">
            No variables added. Click + to add one.
          </Text>
        )}

        {variables.map((row) => (
          <div key={row.id} className="flex items-center gap-x-2">
            <Input
              placeholder="variable_name"
              value={row.key}
              onChange={(e) => updateVariable(row.id, "key", e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="value"
              value={row.value}
              onChange={(e) => updateVariable(row.id, "value", e.target.value)}
              className="flex-1"
            />
            <IconButton
              size="small"
              variant="transparent"
              onClick={() => removeVariable(row.id)}
              title="Remove variable"
            >
              <Trash />
            </IconButton>
          </div>
        ))}
      </div>

      {/* Submit */}
      <div className="flex justify-end pt-2 border-t border-ui-border-base">
        <Button
          onClick={handleSubmit}
          isLoading={sendTest.isPending}
          disabled={sendTest.isPending}
        >
          Send Test Email
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChecklistTab
// ---------------------------------------------------------------------------

const ChecklistTab = () => {
  const [checklistEnabled, setChecklistEnabled] = useState(false)
  const [, forceUpdate] = useState(0)

  const { data: checklist, isFetching, isError, error, refetch } = useQuery<ChecklistResponse>({
    queryKey: ["mailgun-checklist"],
    queryFn: () => sdk.client.fetch("/admin/mailgun/checklist") as Promise<ChecklistResponse>,
    enabled: checklistEnabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  const handleRunChecklist = () => {
    if (!checklistEnabled) {
      setChecklistEnabled(true)
    } else {
      refetch()
    }
  }

  // Update relative time every 60s
  useEffect(() => {
    if (!checklist) return
    const interval = setInterval(() => forceUpdate((n) => n + 1), 60_000)
    return () => clearInterval(interval)
  }, [checklist])

  const statusMessage = (status: "pass" | "warn" | "fail", inlineCount: number) => {
    const inlineNote = inlineCount > 0
      ? ` ${inlineCount} event${inlineCount === 1 ? "" : "s"} use inline content and were not verified against Mailgun.`
      : ""
    if (status === "pass") return `All wired events are configured correctly.${inlineNote}`
    if (status === "warn") return `Some events have warnings. Review the table below.${inlineNote}`
    return `One or more events are missing subscribers or Mailgun templates.${inlineNote}`
  }

  return (
    <div className="flex flex-col gap-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-y-1">
          <Text weight="plus">Event Checklist</Text>
          <Text size="small" className="text-ui-fg-subtle">
            Check that subscribers and Mailgun templates are wired up for each event.
          </Text>
        </div>
        <div className="flex flex-col items-end gap-y-1">
          <Button
            variant="secondary"
            size="small"
            isLoading={isFetching}
            disabled={isFetching}
            onClick={handleRunChecklist}
          >
            {checklist ? "Refresh" : "Run Checklist"}
          </Button>
          {checklist && (
            <Tooltip content={absoluteTime(checklist.checked_at)}>
              <Text size="xsmall" className="text-ui-fg-subtle cursor-default">
                {relativeTime(checklist.checked_at)}
              </Text>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Infrastructure warning banners */}
      {checklist && !checklist.subscriber_root_found && (
        <div className="border border-red-500 rounded px-4 py-3">
          <Text size="small">
            Subscriber directory not found at {checklist.subscriber_root}. Create this directory in your Medusa project.
          </Text>
        </div>
      )}
      {checklist && !checklist.mailgun_templates_reachable && (
        <div className="border border-red-500 rounded px-4 py-3 flex flex-col gap-y-1">
          <Text size="small">
            Cannot reach Mailgun Templates API. Verify MAILGUN_API_KEY and MAILGUN_DOMAIN are correct.
          </Text>
          {checklist.mailgun_error && (
            <Text size="small" className="text-ui-fg-subtle">
              {checklist.mailgun_error}
            </Text>
          )}
        </div>
      )}

      {/* Top-level status bar */}
      {checklist && !isError && (
        <div className={`px-4 py-3 rounded border-l-4 border-grey-500 bg-ui-bg-subtle`}>
          <Text size="small">{statusMessage(checklist.status, checklist.inline_count)}</Text>
        </div>
      )}

      {/* Empty state (before first run) */}
      {!checklistEnabled && !checklist && (
        <div className="flex justify-center py-8">
          <Text size="small" className="text-ui-fg-subtle">
            Run the checklist to verify your event configuration.
          </Text>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-start gap-y-3">
          <Text size="small" className="text-ui-fg-error">
            Failed to load checklist: {(error as Error)?.message}
          </Text>
          <Button variant="secondary" size="small" onClick={handleRunChecklist}>
            Try Again
          </Button>
        </div>
      )}

      {/* Table */}
      {checklist && !isError && checklist.events.length > 0 && (
        <div className="flex flex-col">
          {/* Header */}
          <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr] gap-x-4 py-2 pl-4 border-b border-ui-border-base">
            <Text size="xsmall" className="text-ui-fg-muted uppercase tracking-wide">Event</Text>
            <Text size="xsmall" className="text-ui-fg-muted uppercase tracking-wide">File</Text>
            <Text size="xsmall" className="text-ui-fg-muted uppercase tracking-wide">Subscriber</Text>
            <Text size="xsmall" className="text-ui-fg-muted uppercase tracking-wide">Template</Text>
            <Text size="xsmall" className="text-ui-fg-muted uppercase tracking-wide">Status</Text>
          </div>

          {/* Rows */}
          {checklist.events.map((event, index) => (
            <div
              key={event.event}
              className={`grid grid-cols-[2fr_2fr_1fr_1fr_1fr] gap-x-4 py-3 pl-4 items-start border-b border-ui-border-base border-l-4 ${
                event.status === "fail"
                  ? "border-l-red-500"
                  : event.status === "warn"
                  ? "border-l-orange-400"
                  : "border-l-green-500"
              } ${index % 2 === 0 ? "bg-ui-bg-base" : "bg-ui-bg-subtle"}`}
            >
              {/* Event name + hint */}
              <div className="flex flex-col gap-y-1">
                <span className="font-mono text-sm">{event.event}</span>
                {event.hint && (
                  <Text size="xsmall" className="text-ui-fg-subtle">{event.hint}</Text>
                )}
              </div>

              {/* Subscriber file */}
              <Text size="small" className="text-ui-fg-subtle font-mono truncate">
                {event.subscriber_file ?? "—"}
              </Text>

              {/* Subscriber found badge */}
              <div>
                {event.subscriber_found ? (
                  <Badge color="green">Found</Badge>
                ) : (
                  <Badge color="red">Missing</Badge>
                )}
              </div>

              {/* Template exists badge */}
              <div>
                {event.status === "inline" ? (
                  <Badge color="grey">—</Badge>
                ) : event.template_exists_in_mailgun === true ? (
                  <Badge color="green">Found</Badge>
                ) : event.template_exists_in_mailgun === false ? (
                  <Badge color="red">Missing</Badge>
                ) : (
                  <Badge color="grey">—</Badge>
                )}
              </div>

              {/* Status badge */}
              <div>
                {event.status === "pass" && <Badge color="green">Pass</Badge>}
                {event.status === "warn" && <Badge color="orange">Warn</Badge>}
                {event.status === "inline" && <Badge color="grey">Inline</Badge>}
                {event.status === "fail" && <Badge color="red">Fail</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MailgunPage (default export)
// ---------------------------------------------------------------------------

const MailgunPage = () => {
  const [activeTab, setActiveTab] = useState("send-test")

  return (
    <Container className="flex flex-col gap-y-0 p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-x-3 px-6 py-4 border-b border-ui-border-base">
        <EnvelopeSolid className="text-ui-fg-subtle" />
        <div>
          <Heading level="h1">Mailgun</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Manage and verify your Mailgun notification setup
          </Text>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Trigger value="send-test">Send Test</Tabs.Trigger>
            <Tabs.Trigger value="checklist">Event Checklist</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="send-test" className="pt-6">
            <SendTestTab />
          </Tabs.Content>
          <Tabs.Content value="checklist" className="pt-6">
            <ChecklistTab />
          </Tabs.Content>
        </Tabs>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Mailgun",
  icon: EnvelopeSolid,
})

export default MailgunPage
