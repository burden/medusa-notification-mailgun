import { useState } from "react"
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
} from "@medusajs/ui"
import { EnvelopeSolid, PlusMini, Trash } from "@medusajs/icons"
import { sdk } from "../../lib/sdk"

type VariableRow = { id: string; key: string; value: string }

const MailgunTestPage = () => {
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
    <Container className="flex flex-col gap-y-6 p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-x-3 px-6 py-4 border-b border-ui-border-base">
        <EnvelopeSolid className="text-ui-fg-subtle" />
        <div>
          <Heading level="h1">Send Test Email</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Send a test notification via the Mailgun provider
          </Text>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-y-6 px-6 pb-6">
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
            Optional. Plain-text body used when no Mailgun template is
            specified. If both are left blank, a default test message is
            sent automatically.
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
            Optional. Must match a template name in your Mailgun account. If
            left blank, the message body above (or an auto-generated test
            message) is used instead.
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
                onChange={(e) =>
                  updateVariable(row.id, "value", e.target.value)
                }
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
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Mailgun Test",
  icon: EnvelopeSolid,
})

export default MailgunTestPage
