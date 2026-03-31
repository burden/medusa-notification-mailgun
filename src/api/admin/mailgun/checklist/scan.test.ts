import * as fs from "fs"
import { scanSubscribers, EventCheckConfig } from "./scan"

jest.mock("fs")

const mockExistsSync = fs.existsSync as jest.Mock
const mockReaddirSync = fs.readdirSync as jest.Mock
const mockReadFileSync = fs.readFileSync as jest.Mock
const mockRealpathSync = fs.realpathSync as unknown as jest.Mock

const eventMap: EventCheckConfig[] = [
  { event: "order.placed", expected_template: "order-confirmation" },
  { event: "order.canceled", expected_template: "order-canceled" },
]

beforeEach(() => {
  mockExistsSync.mockReset()
  mockReaddirSync.mockReset()
  mockReadFileSync.mockReset()
  mockRealpathSync.mockReset()
  // Default: realpathSync returns input unchanged (no symlinks)
  mockRealpathSync.mockImplementation((p: string) => p)
})

describe("scanSubscribers", () => {
  it("returns all events as not found when subscribers directory does not exist", () => {
    mockExistsSync.mockReturnValue(false)

    const results = scanSubscribers("/fake/cwd", eventMap)

    expect(results).toHaveLength(2)
    for (const result of results) {
      expect(result.subscriber_found).toBe(false)
      expect(result.subscriber_file).toBeNull()
      expect(result.template_name_in_subscriber).toBe(false)
    }
    expect(mockReaddirSync).not.toHaveBeenCalled()
  })

  it("returns subscriber_found and template_name_in_subscriber true when both strings are present", () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(["order.ts"])
    mockReadFileSync.mockReturnValue(
      `export const config = { event: "order.placed" }
       createNotifications({ template: "order-confirmation" })`
    )

    const results = scanSubscribers("/fake/cwd", eventMap)
    const orderPlaced = results.find((r) => r.event === "order.placed")!

    expect(orderPlaced.subscriber_found).toBe(true)
    expect(orderPlaced.template_name_in_subscriber).toBe(true)
    expect(orderPlaced.subscriber_file).toBe("src/subscribers/order.ts")
  })

  it("returns subscriber_found true but template_name_in_subscriber false when template string is absent", () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(["order.ts"])
    mockReadFileSync.mockReturnValue(
      `export const config = { event: "order.placed" }
       createNotifications({ template: "wrong-template" })`
    )

    const results = scanSubscribers("/fake/cwd", eventMap)
    const orderPlaced = results.find((r) => r.event === "order.placed")!

    expect(orderPlaced.subscriber_found).toBe(true)
    expect(orderPlaced.template_name_in_subscriber).toBe(false)
    expect(orderPlaced.subscriber_file).toBe("src/subscribers/order.ts")
  })

  it("returns subscriber_found false when no file contains the event string", () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(["unrelated.ts"])
    mockReadFileSync.mockReturnValue(`export const config = { event: "customer.created" }`)

    const results = scanSubscribers("/fake/cwd", eventMap)
    const orderPlaced = results.find((r) => r.event === "order.placed")!

    expect(orderPlaced.subscriber_found).toBe(false)
    expect(orderPlaced.subscriber_file).toBeNull()
    expect(orderPlaced.template_name_in_subscriber).toBe(false)
  })

  it("does not match event name when dots are unescaped (e.g. orderXplaced)", () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(["tricky.ts"])
    mockReadFileSync.mockReturnValue(
      `export const config = { event: "orderXplaced" }`
    )

    const results = scanSubscribers("/fake/cwd", eventMap)
    const orderPlaced = results.find((r) => r.event === "order.placed")!

    expect(orderPlaced.subscriber_found).toBe(false)
  })

  it("only reads .ts files, ignoring other extensions", () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(["order.ts", "README.md", "notes.txt"])
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith("order.ts")) {
        return `export const config = { event: "order.placed" }
                createNotifications({ template: "order-confirmation" })`
      }
      throw new Error(`Should not read: ${filePath}`)
    })

    expect(() => scanSubscribers("/fake/cwd", eventMap)).not.toThrow()
    const tsCallPaths = mockReadFileSync.mock.calls.map((c) => c[0] as string)
    expect(tsCallPaths.every((p) => p.endsWith(".ts"))).toBe(true)
  })

  it("throws when subscribersDir resolves outside cwd (symlink escape)", () => {
    mockExistsSync.mockReturnValue(true)
    // Simulate a symlink that points outside the project root
    mockRealpathSync.mockImplementation((p: string) => {
      if (p.includes("subscribers")) return "/tmp/attacker-controlled"
      return "/fake/cwd"
    })

    expect(() => scanSubscribers("/fake/cwd", eventMap)).toThrow(
      "Subscribers directory is outside the project root"
    )
    expect(mockReaddirSync).not.toHaveBeenCalled()
  })

  it("skips files whose resolved paths escape subscribersDir (symlink per-file attack)", () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(["escape.ts"])
    // subscribersDir resolves normally, but the individual file symlinks outside
    mockRealpathSync.mockImplementation((p: string) => {
      if (p.endsWith("escape.ts")) return "/etc/passwd"
      return p
    })

    // Should not throw; the file is silently skipped
    const results = scanSubscribers("/fake/cwd", eventMap)
    expect(mockReadFileSync).not.toHaveBeenCalled()
    for (const r of results) {
      expect(r.subscriber_found).toBe(false)
    }
  })

  it("maps each event to its correct file when subscribers are spread across multiple files", () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(["order-placed.ts", "order-canceled.ts"])
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith("order-placed.ts")) {
        return `export const config = { event: "order.placed" }
                createNotifications({ template: "order-confirmation" })`
      }
      if (filePath.endsWith("order-canceled.ts")) {
        return `export const config = { event: "order.canceled" }
                createNotifications({ template: "order-canceled" })`
      }
      return ""
    })

    const results = scanSubscribers("/fake/cwd", eventMap)

    const placed = results.find((r) => r.event === "order.placed")!
    expect(placed.subscriber_found).toBe(true)
    expect(placed.subscriber_file).toBe("src/subscribers/order-placed.ts")
    expect(placed.template_name_in_subscriber).toBe(true)

    const canceled = results.find((r) => r.event === "order.canceled")!
    expect(canceled.subscriber_found).toBe(true)
    expect(canceled.subscriber_file).toBe("src/subscribers/order-canceled.ts")
    expect(canceled.template_name_in_subscriber).toBe(true)
  })
})
