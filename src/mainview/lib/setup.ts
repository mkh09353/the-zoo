import { createSession, sendMessage } from "./api"
import { getRpc, nativeRpcAvailable, type RpcClient } from "./rpc"
import type { SetupSessionMeta, ZooCredentialMeta } from "../../shared/zooTypes"

export type { SetupSessionMeta } from "../../shared/zooTypes"
export type SetupCredentialMeta = ZooCredentialMeta
export type SetupResult<T> = ({ ok: true } & T) | { ok: false; error: string }

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
const string = (value: unknown): value is string => typeof value === "string"
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

export function parseSetupSession(value: unknown): SetupSessionMeta | null {
  const row = object(value)
  return row && string(row.sessionId) && string(row.title) && finite(row.createdAt) && finite(row.lastActivityAt)
    ? { sessionId: row.sessionId, title: row.title, createdAt: row.createdAt, lastActivityAt: row.lastActivityAt } : null
}
export function parseCredential(value: unknown): SetupCredentialMeta | null {
  const row = object(value)
  return row && string(row.name) && finite(row.createdAt) ? { name: row.name, createdAt: row.createdAt } : null
}
export function parseSetupSessions(value: unknown): SetupResult<{ sessions: SetupSessionMeta[] }> {
  const row = object(value)
  if (row?.ok === false && string(row.error)) return { ok: false, error: row.error }
  if (!row || row.ok !== true || !Array.isArray(row.sessions)) return { ok: false, error: "Invalid setup sessions response." }
  const sessions = row.sessions.map(parseSetupSession)
  return sessions.every((session): session is SetupSessionMeta => session !== null)
    ? { ok: true, sessions }
    : { ok: false, error: "Invalid setup sessions response." }
}
export function parseCredentialList(value: unknown): SetupResult<{ credentials: SetupCredentialMeta[] }> {
  const row = object(value)
  if (row?.ok === false && string(row.error)) return { ok: false, error: row.error }
  if (!row || row.ok !== true || !Array.isArray(row.credentials)) return { ok: false, error: "Invalid credential response." }
  const credentials = row.credentials.map(parseCredential)
  return credentials.every((credential): credential is SetupCredentialMeta => credential !== null)
    ? { ok: true, credentials }
    : { ok: false, error: "Invalid credential response." }
}
export function parseCredentialResult(value: unknown): SetupResult<{ credential: SetupCredentialMeta }> {
  const row = object(value)
  if (row?.ok === false && string(row.error)) return { ok: false, error: row.error }
  const credential = row?.ok === true ? parseCredential(row.credential) : null
  return credential ? { ok: true, credential } : { ok: false, error: "Invalid credential response." }
}
export function parseSessionResult(value: unknown): SetupResult<{ session: SetupSessionMeta }> {
  const row = object(value)
  if (row?.ok === false && string(row.error)) return { ok: false, error: row.error }
  const session = row?.ok === true ? parseSetupSession(row.session) : null
  return session ? { ok: true, session } : { ok: false, error: "Invalid setup session response." }
}
export function parseOk(value: unknown): SetupResult<Record<never, never>> {
  const row = object(value)
  if (row?.ok === false && string(row.error)) return { ok: false, error: row.error }
  return row?.ok === true ? { ok: true } : { ok: false, error: "Invalid native response." }
}

async function rpcOrUnavailable(): Promise<RpcClient | null> {
  return nativeRpcAvailable() ? getRpc() : null
}
async function request(name: string, args: unknown): Promise<unknown> {
  const rpc = await rpcOrUnavailable()
  if (!rpc?.request?.[name]) return undefined
  return rpc.request[name](args)
}

export async function listSetupSessions(): Promise<SetupResult<{ sessions: SetupSessionMeta[] }>> {
  if (!nativeRpcAvailable()) return { ok: false, error: "Setup history is available in the desktop app." }
  try {
    return parseSetupSessions(await request("zooListSetupSessions", {}))
  } catch {
    return { ok: false, error: "Could not load setup sessions." }
  }
}
export async function recordSetupSession(input: { sessionId: string; title?: string }): Promise<SetupResult<{ session: SetupSessionMeta }>> {
  if (!nativeRpcAvailable()) return { ok: false, error: "Setup history is available in the desktop app." }
  try {
    return parseSessionResult(await request("zooRecordSetupSession", input))
  } catch {
    return { ok: false, error: "Could not save the setup session." }
  }
}
export async function listCredentials(): Promise<SetupResult<{ credentials: SetupCredentialMeta[] }>> {
  if (!nativeRpcAvailable()) return { ok: false, error: "Named credentials are available in the desktop app." }
  try {
    return parseCredentialList(await request("zooListCredentials", {}))
  } catch {
    return { ok: false, error: "Could not load saved credential names." }
  }
}
export async function setCredential(name: string, value: string): Promise<SetupResult<{ credential: SetupCredentialMeta }>> {
  if (!nativeRpcAvailable()) return { ok: false, error: "Named credentials are available in the desktop app." }
  try {
    return parseCredentialResult(await request("zooSetCredential", { name, value }))
  } catch {
    return { ok: false, error: "Could not save the credential." }
  }
}
export async function deleteCredential(name: string): Promise<SetupResult<Record<never, never>>> {
  if (!nativeRpcAvailable()) return { ok: false, error: "Named credentials are available in the desktop app." }
  try {
    return parseOk(await request("zooDeleteCredential", { name }))
  } catch {
    return { ok: false, error: "Could not delete the credential." }
  }
}

export interface SetupStartDeps {
  create: (baseUrl: string, repoId?: string | null) => Promise<{ sessionId: string }>
  send: (baseUrl: string, sessionId: string, message: string, options: { skill: string }) => Promise<unknown>
  record: (input: { sessionId: string; title?: string }) => Promise<SetupResult<{ session: SetupSessionMeta }>>
}

export async function startSetupSessionWithDeps(
  baseUrl: string | null | undefined,
  repoId: string | null | undefined,
  message: string,
  deps: SetupStartDeps,
): Promise<SetupResult<{ sessionId: string }>> {
  if (!baseUrl) return { ok: false, error: "Connect to Chunky before starting setup." }
  const text = message.trim()
  if (!text) return { ok: false, error: "Describe what you want to set up." }
  try {
    const created = await deps.create(baseUrl, repoId)
    await deps.send(baseUrl, created.sessionId, text, { skill: "zoo-ledger" })
    // The Chunky session is authoritative. Native metadata is an optional index
    // and must never strand a successfully-created conversation.
    try {
      await deps.record({ sessionId: created.sessionId, title: text.slice(0, 60) })
    } catch {
      // Opening the real conversation still succeeds without the local index.
    }
    return { ok: true, sessionId: created.sessionId }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not start setup." }
  }
}

export function startSetupSession(
  baseUrl: string | null | undefined,
  repoId: string | null | undefined,
  message: string,
): Promise<SetupResult<{ sessionId: string }>> {
  return startSetupSessionWithDeps(baseUrl, repoId, message, {
    create: createSession,
    send: sendMessage,
    record: recordSetupSession,
  })
}
