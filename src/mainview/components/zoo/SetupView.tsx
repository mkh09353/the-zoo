import { useEffect, useState, type ReactNode } from "react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import {
  deleteCredential,
  listCredentials,
  listSetupSessions,
  setCredential,
  startSetupSession,
  type SetupCredentialMeta,
  type SetupSessionMeta,
} from "~/lib/setup"

function SetupSection({ children }: { children: ReactNode }) {
  return <section className="rounded-xl border border-border/70 bg-card/40 p-5">{children}</section>
}

type SetupViewProps = {
  baseUrl?: string | null
  repoId?: string | null
  onOpenSession?: (id: string) => void
  onBack: () => void
}

export function SetupView({ baseUrl, repoId, onOpenSession, onBack }: SetupViewProps) {
  const [sessions, setSessions] = useState<SetupSessionMeta[]>([])
  const [credentials, setCredentials] = useState<SetupCredentialMeta[]>([])
  const [message, setMessage] = useState("")
  const [name, setName] = useState("")
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    setError(null)
    const [sessionResult, credentialResult] = await Promise.all([listSetupSessions(), listCredentials()])
    if (sessionResult.ok) setSessions(sessionResult.sessions)
    else setSessions([])
    if (credentialResult.ok) setCredentials(credentialResult.credentials)
    else setCredentials([])
    const failures = [sessionResult, credentialResult]
      .filter((result): result is { ok: false; error: string } => !result.ok)
      .map((result) => result.error)
    setError(failures.length ? failures.join(" ") : null)
  }
  useEffect(() => {
    let active = true
    void Promise.all([listSetupSessions(), listCredentials()]).then(([sessionResult, credentialResult]) => {
      if (!active) return
      setSessions(sessionResult.ok ? sessionResult.sessions : [])
      setCredentials(credentialResult.ok ? credentialResult.credentials : [])
      const failures = [sessionResult, credentialResult]
        .filter((result): result is { ok: false; error: string } => !result.ok)
        .map((result) => result.error)
      setError(failures.length ? failures.join(" ") : null)
    })
    return () => { active = false }
  }, [])

  const remove = async (credentialName: string) => {
    setBusy(true)
    setError(null)
    const result = await deleteCredential(credentialName)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await refresh()
  }

  const start = async () => {
    if (!message.trim()) return
    setBusy(true)
    setError(null)
    const result = await startSetupSession(baseUrl, repoId, message.trim())
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage("")
    onOpenSession?.(result.sessionId)
  }

  const save = async () => {
    if (!name.trim() || !value) return
    setBusy(true)
    setError(null)
    const result = await setCredential(name.trim(), value)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setValue("")
    setName("")
    await refresh()
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header>
          <Button variant="ghost" size="sm" onClick={onBack}>Back to Zoo</Button>
          <h1 className="mt-3 font-semibold text-xl">Setup</h1>
          <p className="mt-1 text-sm text-muted-foreground">Start a guided Zoo setup conversation with Chunky.</p>
        </header>
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <SetupSection>
          <h2 className="font-medium">New setup conversation</h2>
          <div className="mt-3 flex gap-2">
            <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What are you setting up?" onKeyDown={(event) => { if (event.key === "Enter") void start() }} />
            <Button disabled={busy || !baseUrl || !message.trim()} onClick={() => void start()}>Start</Button>
          </div>
          {!baseUrl && <p className="mt-2 text-xs text-muted-foreground">Connect to Chunky to start a setup conversation.</p>}
        </SetupSection>
        <SetupSection>
          <h2 className="font-medium">Setup sessions</h2>
          <div className="mt-3 flex flex-col gap-1">
            {sessions.length ? sessions.map((session) => (
              <Button key={session.sessionId} variant="ghost" className="justify-start" onClick={() => onOpenSession?.(session.sessionId)}>
                {session.title || session.sessionId.slice(0, 8)}
              </Button>
            )) : <p className="text-sm text-muted-foreground">No setup sessions yet.</p>}
          </div>
        </SetupSection>
        <SetupSection>
          <h2 className="font-medium">Named credentials</h2>
          <p className="mt-1 text-xs text-muted-foreground">Only names are shown. Values are never displayed after saving.</p>
          <div className="mt-3 flex gap-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" />
            <Input type="password" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Value" />
            <Button disabled={busy || !name.trim() || !value} onClick={() => void save()}>Save</Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {credentials.map((credential) => (
              <span key={credential.name} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                {credential.name}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={busy}
                  aria-label={`Remove ${credential.name}`}
                  onClick={() => void remove(credential.name)}
                >×</Button>
              </span>
            ))}
          </div>
        </SetupSection>
      </div>
    </div>
  )
}
