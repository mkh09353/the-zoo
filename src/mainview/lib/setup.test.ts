import { expect, test } from "bun:test"
import {
  parseCredentialList,
  parseCredentialResult,
  parseOk,
  parseSetupSessions,
  startSetupSessionWithDeps,
} from "./setup"

test("rejects malformed native setup and credential responses", () => {
  expect(parseSetupSessions({ ok: true, sessions: [{ sessionId: "x" }] })).toMatchObject({ ok: false })
  expect(parseCredentialList({ ok: true, credentials: [{ name: "token", createdAt: "secret" }] })).toMatchObject({ ok: false })
  expect(parseCredentialResult({ ok: true, credential: { name: "token", createdAt: 1, value: "secret" } })).toMatchObject({ ok: true, credential: { name: "token", createdAt: 1 } })
  expect(parseCredentialResult({ ok: false, error: "Invalid credential" })).toEqual({ ok: false, error: "Invalid credential" })
  expect(parseOk({ ok: false, error: "bad" })).toMatchObject({ ok: false })
})

test("offline setup reports a connection error without creating a session", async () => {
  const result = await startSetupSessionWithDeps(null, null, "hello", { create: async () => { throw new Error("should not run") }, send: async () => null, record: async () => ({ ok: true, session: { sessionId: "x", title: "", createdAt: 1, lastActivityAt: 1 } }) })
  expect(result).toEqual({ ok: false, error: "Connect to Chunky before starting setup." })
})

test("blank setup does not create a session", async () => {
  let created = false
  const result = await startSetupSessionWithDeps("http://chunky", null, "   ", {
    create: async () => { created = true; return { sessionId: "x" } },
    send: async () => null,
    record: async () => ({ ok: true, session: { sessionId: "x", title: "", createdAt: 1, lastActivityAt: 1 } }),
  })
  expect(result).toEqual({ ok: false, error: "Describe what you want to set up." })
  expect(created).toBe(false)
})

test("creates, sends with zoo-ledger skill, and opens the session when metadata fails", async () => {
  const calls: string[] = []
  const result = await startSetupSessionWithDeps("http://chunky", "repo", "First setup turn", {
    create: async (url, repo) => { calls.push(`create:${url}:${repo}`); return { sessionId: "session-1" } },
    send: async (url, id, text, options) => { calls.push(`send:${url}:${id}:${text}:${options.skill}`); return null },
    record: async () => ({ ok: false, error: "native storage unavailable" }),
  })
  expect(result).toEqual({ ok: true, sessionId: "session-1" })
  expect(calls).toEqual(["create:http://chunky:repo", "send:http://chunky:session-1:First setup turn:zoo-ledger"])
})

test("opens the real session when metadata storage throws", async () => {
  const result = await startSetupSessionWithDeps("http://chunky", null, "hello", {
    create: async () => ({ sessionId: "real-session" }),
    send: async () => null,
    record: async () => { throw new Error("native bridge closed") },
  })
  expect(result).toEqual({ ok: true, sessionId: "real-session" })
})

test("reports a send failure after creation and does not record metadata", async () => {
  let recorded = false
  const result = await startSetupSessionWithDeps("http://chunky", null, "hello", {
    create: async () => ({ sessionId: "real-session" }),
    send: async () => { throw new Error("chunky unreachable") },
    record: async () => { recorded = true; return { ok: true, session: { sessionId: "real-session", title: "hello", createdAt: 1, lastActivityAt: 1 } } },
  })
  expect(result).toEqual({ ok: false, error: "chunky unreachable" })
  expect(recorded).toBe(false)
})
