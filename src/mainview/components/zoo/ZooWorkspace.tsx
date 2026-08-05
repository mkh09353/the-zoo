// The Zoo: the app's primary surface.
//
// Three zones — a slim nav rail, one main column, and a detail pane that opens
// on selection — over the product-factory board (Sources -> Insights -> Ideas ->
// Items). The Inbox is the point of the whole thing: a queue of decisions with
// their evidence attached. Chat is still one click away in the header, but it is
// no longer where the work starts.
//
// Data comes from hooks/useZooBoard.ts and every mutation goes through
// lib/zoo*.ts — this file makes no server calls of its own.

import { Factory, Inbox, LayoutGrid, LoaderCircle, MessagesSquare, Plug, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useZooBoard } from "~/hooks/useZooBoard"
import { cn } from "~/lib/cn"
import { DRAG_REGION, NO_DRAG_REGION } from "~/lib/dragRegion"
import { ZOO_UNAVAILABLE, type ZooIdea, type ZooItem } from "~/lib/zoo"
import { startFactoryChat } from "~/lib/zooChat"
import { runExtraction, type ExtractionPhase } from "~/lib/zooExtraction"
import { buildInbox, entryForIdea, entryForItem, inFlightItems, type InboxEntry } from "~/lib/zooInbox"
import { runSynthesis, runTriage } from "~/lib/zooSynthesis"
import { Button } from "../ui/button"
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip"
import { BoardView } from "./BoardView"
import { DetailPane } from "./DetailPane"
import { InboxView } from "./InboxView"
import { EmptyState, Notice } from "./parts"
import { IDLE_RUNS, SourcesView, type RunKind, type RunState } from "./SourcesView"

type ZooView = "inbox" | "board" | "sources"

const VIEWS: { id: ZooView; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "board", label: "Board", icon: LayoutGrid },
  { id: "sources", label: "Sources", icon: Plug },
]

export function ZooWorkspace({
  baseUrl,
  repoId,
  onOpenSession,
  onOpenChat,
}: {
  /** Live Chunky server, or null when there is none — runs stay disabled. */
  baseUrl?: string | null
  /** Selected repository; promotion and triage bind their sessions to it. */
  repoId?: string | null
  /** Show a session in the (secondary) chat surface. */
  onOpenSession?: (sessionId: string) => void
  onOpenChat: () => void
}) {
  const board = useZooBoard()
  const [view, setView] = useState<ZooView>("inbox")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [setAside, setSetAside] = useState<string[]>([])
  const [talking, setTalking] = useState(false)
  const [headerError, setHeaderError] = useState<string | null>(null)

  const [runs, setRuns] = useState<Record<RunKind, RunState>>(IDLE_RUNS)
  const [elapsed, setElapsed] = useState(0)
  const runningRef = useRef<Set<RunKind>>(new Set())

  const { ideas, items, insights, refresh } = board

  const entries = useMemo(
    () => buildInbox({ ideas, items, insights, dismissed: setAside }),
    [ideas, items, insights, setAside],
  )
  const inFlight = useMemo(() => inFlightItems(items), [items])

  /** Every selectable thing, queued or not, in the shape the detail pane wants. */
  const catalog = useMemo(() => {
    const map = new Map<string, InboxEntry>()
    for (const entry of entries) map.set(entry.id, entry)
    for (const item of items) {
      if (!map.has(`item:${item.id}`)) map.set(`item:${item.id}`, entryForItem(item, ideas, insights))
    }
    for (const idea of ideas) {
      if (!map.has(`idea:${idea.id}`)) map.set(`idea:${idea.id}`, entryForIdea(idea, insights))
    }
    return map
  }, [entries, ideas, items, insights])

  const selected = selectedId ? catalog.get(selectedId) ?? null : null

  // A decision removes its card; don't leave the pane pointing at a ghost.
  useEffect(() => {
    if (selectedId && !catalog.has(selectedId)) setSelectedId(null)
  }, [catalog, selectedId])

  const anyRunning = Object.values(runs).some((run) => run.kind === "running")
  useEffect(() => {
    if (!anyRunning) return
    const startedAt = Math.min(
      ...Object.values(runs)
        .filter((run): run is Extract<RunState, { kind: "running" }> => run.kind === "running")
        .map((run) => run.startedAt),
    )
    setElapsed(Date.now() - startedAt)
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 1000)
    return () => clearInterval(timer)
  }, [anyRunning, runs])

  const setRun = (kind: RunKind, state: RunState) => setRuns((prev) => ({ ...prev, [kind]: state }))

  const startRun = useCallback(
    async (kind: RunKind) => {
      if (runningRef.current.has(kind)) return
      runningRef.current.add(kind)
      setRun(kind, { kind: "running", phase: "exporting", startedAt: Date.now() })
      const onPhase = (phase: ExtractionPhase) =>
        setRuns((prev) => {
          const current = prev[kind]
          return current.kind === "running" ? { ...prev, [kind]: { ...current, phase } } : prev
        })

      let state: RunState
      if (kind === "extraction") {
        const result = await runExtraction({ baseUrl, onPhase })
        state = result.ok
          ? {
              kind: "done",
              note: `Extraction complete — ${result.insightCount} insight${result.insightCount === 1 ? "" : "s"} recorded.`,
            }
          : { kind: "error", error: result.error }
      } else if (kind === "synthesis") {
        const result = await runSynthesis({ baseUrl, onPhase })
        state = result.ok
          ? {
              kind: "done",
              note: `Synthesis complete — ${result.ideaCount} idea${result.ideaCount === 1 ? "" : "s"} proposed${result.dropped ? `, ${result.dropped} entry ignored` : ""}.`,
            }
          : { kind: "error", error: result.error }
      } else {
        const result = await runTriage(repoId ?? "", { baseUrl, onPhase })
        state = result.ok
          ? {
              kind: "done",
              note: `Triage complete — ${result.ideaCount} idea${result.ideaCount === 1 ? "" : "s"} proposed${result.dropped ? `, ${result.dropped} entry ignored` : ""}.`,
            }
          : { kind: "error", error: result.error }
      }
      runningRef.current.delete(kind)
      setRun(kind, state)
      await refresh()
    },
    [baseUrl, refresh, repoId],
  )

  const talkToFactory = async () => {
    if (talking) return
    setTalking(true)
    setHeaderError(null)
    const result = await startFactoryChat(baseUrl, repoId)
    setTalking(false)
    if (!result.ok) {
      setHeaderError(result.error)
      return
    }
    onOpenSession?.(result.sessionId)
  }

  const openSession = onOpenSession
    ? (sessionId: string) => onOpenSession(sessionId)
    : undefined

  const counts = board.status
  const subtitle = counts
    ? `${counts.artifactCount} artifact${counts.artifactCount === 1 ? "" : "s"} · ${counts.insightCount} insight${counts.insightCount === 1 ? "" : "s"} · ${counts.ideaCount} idea${counts.ideaCount === 1 ? "" : "s"} · ${counts.itemCount} item${counts.itemCount === 1 ? "" : "s"}`
    : "The product factory"

  const main = !board.available ? (
    <EmptyState
      icon={<Factory className="size-5" />}
      title={ZOO_UNAVAILABLE}
      body="Sources, evidence and the decision log live in the desktop app's local store. The web development build has no access to it — the workspace still runs, it just has nothing to show."
      action={
        <Button variant="outline" size="sm" onClick={onOpenChat}>
          <MessagesSquare />
          Open chat instead
        </Button>
      }
    />
  ) : view === "inbox" ? (
    <InboxView
      entries={entries}
      inFlight={inFlight}
      selectedId={selectedId}
      onSelect={setSelectedId}
      context={{ repoId, baseUrl }}
      onRefresh={refresh}
      onSetAside={(id) => {
        setSetAside((prev) => (prev.includes(id) ? prev : [...prev, id]))
        setSelectedId((current) => (current === id ? null : current))
      }}
      onSynthesize={baseUrl ? () => void startRun("synthesis") : undefined}
      synthesizing={runs.synthesis.kind === "running"}
      {...(openSession ? { onOpenSession: openSession } : {})}
      loading={board.loading}
    />
  ) : view === "board" ? (
    <BoardView
      ideas={ideas}
      items={items}
      selectedId={selectedId}
      onSelectIdea={(idea: ZooIdea) => setSelectedId(`idea:${idea.id}`)}
      onSelectItem={(item: ZooItem) => setSelectedId(`item:${item.id}`)}
    />
  ) : (
    <SourcesView
      status={board.status}
      runs={runs}
      elapsed={elapsed}
      onRun={(kind) => void startRun(kind)}
      onRefresh={refresh}
      baseUrl={baseUrl}
      repoId={repoId}
      insightCount={insights.length}
    />
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        className={cn(
          DRAG_REGION,
          "flex h-[52px] shrink-0 items-center gap-3 border-border/70 border-b pr-3 pl-[78px]",
        )}
      >
        <div className="min-w-0">
          <p className="truncate font-semibold text-[13.5px] text-foreground tracking-tight">The Zoo</p>
          <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <div aria-hidden className="h-full min-w-6 flex-1" />
        <div className={cn(NO_DRAG_REGION, "flex shrink-0 items-center gap-1.5")}>
          <Button
            size="sm"
            variant="outline"
            disabled={talking || !baseUrl || !onOpenSession}
            title={baseUrl ? undefined : "Needs a connected Chunky server"}
            onClick={() => void talkToFactory()}
          >
            {talking ? <LoaderCircle className="animate-spin" /> : <MessagesSquare />}
            Talk to the Factory
          </Button>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Refresh the board"
                  disabled={!board.available}
                  onClick={() => void refresh()}
                />
              }
            >
              <RefreshCw />
            </TooltipTrigger>
            <TooltipPopup>Refresh the board</TooltipPopup>
          </Tooltip>
          <Button size="sm" variant="ghost" onClick={onOpenChat}>
            Chat
          </Button>
        </div>
      </header>

      {headerError && (
        <div className="shrink-0 px-4 pt-2">
          <Notice text={headerError} />
        </div>
      )}
      {board.error && (
        <div className="shrink-0 px-4 pt-2">
          <Notice text={board.error} />
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1">
        <nav
          aria-label="Zoo views"
          className="flex w-[4.75rem] shrink-0 flex-col items-stretch gap-1 border-border/70 border-r px-2 py-3"
        >
          {VIEWS.map(({ id, label, icon: Icon }) => {
            const active = view === id
            const badge = id === "inbox" && entries.length > 0 ? entries.length : null
            return (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex cursor-pointer flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10.5px] transition-colors",
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
                {badge !== null && (
                  <span className="absolute top-1.5 right-2 rounded-full bg-primary px-1.5 text-[9.5px] font-medium text-primary-foreground leading-4">
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{main}</main>

        {selected && (
          <DetailPane
            entry={selected}
            onClose={() => setSelectedId(null)}
            {...(openSession ? { onOpenSession: openSession } : {})}
          />
        )}
      </div>
    </div>
  )
}
