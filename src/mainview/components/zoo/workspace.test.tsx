// Render smoke tests for the Zoo workspace: the shell, a full decision card,
// and the detail pane. They catch the failures a type check cannot — a card
// that forgets its evidence, actions, or decision log.
// Run with: bun test src/mainview/components/zoo
import { expect, describe, it } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TooltipProvider } from "../ui/tooltip"
import { ZooWorkspace } from "./ZooWorkspace"
import { InboxView } from "./InboxView"
import { DetailPane } from "./DetailPane"
import { buildInbox } from "~/lib/zooInbox"
import type { ZooIdea, ZooInsight, ZooItem } from "~/lib/zoo"

const insights: ZooInsight[] = [
  {
    id: "i-1",
    passId: "p-1",
    title: "Silent card declines",
    summary: "Three teams reported payments failing with no error.",
    priority: 1,
    evidence: [{ artifactId: "a-1", quote: "The charge just vanished, no email, nothing." }],
    createdAt: 1000,
  },
  {
    id: "i-2",
    passId: "p-2",
    title: "Nobody finds the export button",
    summary: "Support keeps pasting the same screenshot.",
    evidence: [{ artifactId: "a-2", quote: "Where do I download the CSV?" }],
    createdAt: 2000,
  },
]

const ideas: ZooIdea[] = [
  {
    id: "d-1",
    type: "build",
    title: "Retry failed payments",
    rationale: "Silent declines cost real money.",
    status: "promoted",
    insightIds: ["i-1"],
    createdAt: 1000,
    itemId: "t-1",
  },
  {
    id: "d-2",
    type: "investigate",
    title: "Move the export button",
    rationale: "Support cost is measurable.",
    status: "proposed",
    insightIds: [],
    createdAt: 3000,
  },
]

const items: ZooItem[] = [
  {
    id: "t-1",
    ideaId: "d-1",
    title: "Retry failed payments",
    stage: "decision",
    sessionIds: ["s-42"],
    decisions: [
      { at: 1500, actor: "user", note: "Promoted for research" },
      { at: 2500, actor: "agent", note: "Research done: the retry hook already exists." },
    ],
    createdAt: 1000,
    updatedAt: 2500,
  },
]

const entries = buildInbox({ ideas, items, insights })

describe("ZooWorkspace", () => {
  it("renders the three zones and the Talk to the Factory affordance", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ZooWorkspace baseUrl={null} repoId={null} onOpenChat={() => {}} />
      </TooltipProvider>,
    )
    expect(html).toContain("The Zoo")
    expect(html).toContain("Inbox")
    expect(html).toContain("Board")
    expect(html).toContain("Sources")
    expect(html).toContain("Talk to the Factory")
  })

  it("degrades to an explanation instead of crashing without the native bridge", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ZooWorkspace baseUrl={null} repoId={null} onOpenChat={() => {}} />
      </TooltipProvider>,
    )
    expect(html).toContain("requires the desktop app")
    expect(html).toContain("Open chat instead")
  })
})

describe("Inbox decision cards", () => {
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <InboxView
        entries={entries}
        inFlight={[]}
        selectedId={entries[0]?.id ?? null}
        onSelect={() => {}}
        context={{ repoId: "r-1", baseUrl: "http://localhost:4620" }}
        onRefresh={async () => {}}
        onSetAside={() => {}}
        onSynthesize={() => {}}
        onOpenSession={() => {}}
        loading={false}
      />
    </TooltipProvider>,
  )

  it("shows every waiting decision with its verdict actions", () => {
    expect(html).toContain("3 decisions waiting on you")
    expect(html).toContain("Retry failed payments")
    expect(html).toContain("Move the export button")
    expect(html).toContain("Go — approve")
    expect(html).toContain("Go — promote it")
    expect(html).toContain("Not now")
    expect(html).toContain("Add a note")
  })

  it("carries the evidence inline", () => {
    expect(html).toContain("Silent card declines")
    expect(html).toContain("The charge just vanished, no email, nothing.")
  })

  it("offers synthesis on signals nothing cites yet", () => {
    expect(html).toContain("1 fresh signal with nothing proposed yet")
    expect(html).toContain("Synthesize ideas")
  })
})

describe("DetailPane", () => {
  it("shows the full evidence and the decision log for the selected item", () => {
    const entry = entries.find((row) => row.item?.id === "t-1")!
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <DetailPane entry={entry} onClose={() => {}} onOpenSession={() => {}} />
      </TooltipProvider>,
    )
    expect(html).toContain("Retry failed payments")
    expect(html).toContain("Evidence · 1")
    expect(html).toContain("Silent card declines")
    expect(html).toContain("Decision log · 2")
    expect(html).toContain("Research done: the retry hook already exists.")
    expect(html).toContain("Sessions · 1")
    expect(html).toContain("s-42")
  })
})
