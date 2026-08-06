// Render smoke tests for the Zoo workspace: the shell, a full decision card,
// and the detail pane. They catch the failures a type check cannot — a card
// that forgets its evidence, actions, or decision log.
// Run with: bun test src/mainview/components/zoo
import { expect, describe, it } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TooltipProvider } from "../ui/tooltip"
import { ZooWorkspace } from "./ZooWorkspace"
import { InboxView } from "./InboxView"
import { BoardView } from "./BoardView"
import { IDLE_RUNS, SourcesView } from "./SourcesView"
import { DetailPane } from "./DetailPane"
import { buildInbox } from "~/lib/zooInbox"
import type { ZooArea, ZooIdea, ZooInsight, ZooItem } from "~/lib/zoo"

const areas: ZooArea[] = [
  { id: "a-pay", name: "Payments", repoPaths: ["/tmp/payments"], createdAt: 900 },
  { id: "a-growth", name: "Growth", createdAt: 950 },
]

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
    areaId: "a-pay",
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
    areaId: "a-pay",
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
  it("renders the workspace navigation and the Talk to the Factory affordance", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ZooWorkspace baseUrl={null} repoId={null} onOpenChat={() => {}} />
      </TooltipProvider>,
    )
    expect(html).toContain("The Zoo")
    expect(html).toContain("Inbox")
    expect(html).toContain("Board")
    expect(html).toContain("Sources")
    expect(html).toContain("Setup")
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
        areas={areas}
        showAreas
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
        <DetailPane entry={entry} areas={areas} onAssignArea={() => {}} onClose={() => {}} onOpenSession={() => {}} />
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

// ---- Areas in the workspace ------------------------------------------------

function inbox(showAreas: boolean) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <InboxView
        entries={entries}
        inFlight={[]}
        selectedId={null}
        onSelect={() => {}}
        context={{ repoId: "r-1", baseUrl: "http://localhost:4620" }}
        areas={areas}
        showAreas={showAreas}
        onRefresh={async () => {}}
        onSetAside={() => {}}
        onSynthesize={() => {}}
        onOpenSession={() => {}}
        loading={false}
      />
    </TooltipProvider>,
  )
}

describe("area switcher", () => {
  it("opens on All areas and keeps the menu itself out of the way", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ZooWorkspace baseUrl={null} repoId={null} onOpenChat={() => {}} />
      </TooltipProvider>,
    )
    expect(html).toContain("All areas")
    expect(html).toContain('aria-label="Switch area"')
  })
})

describe("area badges", () => {
  it("badges each card with its area under All areas", () => {
    const html = inbox(true)
    expect(html).toContain("Area: Payments")
  })

  it("drops the badge when a single area is already selected", () => {
    expect(inbox(false)).not.toContain("Area: Payments")
  })

  it("badges board cards the same way", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <BoardView
          ideas={ideas}
          items={items}
          areas={areas}
          showAreas
          selectedId={null}
          onSelectIdea={() => {}}
          onSelectItem={() => {}}
        />
      </TooltipProvider>,
    )
    expect(html).toContain("Area: Payments")
    expect(html).toContain("Retry failed payments")
  })
})

describe("DetailPane area assignment", () => {
  it("shows the item's area and offers to move it", () => {
    const entry = entries.find((row) => row.item?.id === "t-1")!
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <DetailPane entry={entry} areas={areas} onAssignArea={() => {}} onClose={() => {}} />
      </TooltipProvider>,
    )
    expect(html).toContain("Area")
    expect(html).toContain("Payments")
    expect(html).toContain('aria-label="Change area"')
  })

  it("says so plainly when a row belongs to no area", () => {
    const unassigned = entries.find((row) => row.idea?.id === "d-2")!
    expect(unassigned.areaId).toBeUndefined()
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <DetailPane entry={unassigned} areas={areas} onAssignArea={() => {}} onClose={() => {}} />
      </TooltipProvider>,
    )
    expect(html).toContain("Unassigned")
    expect(html).toContain("visible in every area")
  })
})

// ---- Competitor watch in the Sources view ---------------------------------

const watches: import("~/lib/zoo").ZooRepoWatch[] = [
  {
    id: "w-1",
    sourceId: "s-watch-1",
    owner: "sst",
    name: "opencode",
    label: "sst/opencode",
    areaId: "a-pay",
    lastCheckAt: Date.now() - 3_600_000,
    lastStatus: "ok",
    lastNote: "Recorded 1 release, 2 merged PRs",
    lastArtifactAt: Date.now() - 3_600_000,
    createdAt: 1000,
  },
  {
    id: "w-2",
    sourceId: "s-watch-2",
    owner: "openai",
    name: "codex",
    label: "openai/codex",
    lastStatus: "skipped",
    lastNote: "GitHub rate limit reached",
    createdAt: 2000,
  },
]

function sources(watchRows: typeof watches) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <SourcesView
        status={{ sources: [], artifactCount: 4, insightCount: 2, ideaCount: 0, itemCount: 0, passes: [] }}
        sources={[]}
        areaId={null}
        areaName={null}
        runs={IDLE_RUNS}
        elapsed={0}
        onRun={() => {}}
        onRefresh={async () => {}}
        baseUrl="http://localhost:4620"
        repoId="r-1"
        insightCount={2}
        watches={watchRows}
        areas={areas}
        watchHour={8}
        watchLastRunAt={Date.now() - 7_200_000}
        onAssignArea={() => {}}
      />
    </TooltipProvider>,
  )
}

describe("competitor watch section", () => {
  it("offers a watchlist even before anything is watched", () => {
    const html = sources([])
    expect(html).toContain("Competitor watch")
    expect(html).toContain("owner/name")
    expect(html).toContain("Daily at")
  })

  it("shows each watch with what its last check found", () => {
    const html = sources(watches)
    expect(html).toContain("sst/opencode")
    expect(html).toContain("Recorded 1 release, 2 merged PRs")
    expect(html).toContain("Check now")
    // A rate-limited check reads as skipped, not as success or as an outage.
    expect(html).toContain("Skipped — GitHub rate limit reached")
    // A watch belongs to an area like any other source.
    expect(html).toContain("Area: Payments")
  })

  it("offers to synthesize deltas a background check already stored", () => {
    expect(sources(watches)).toContain("Synthesize new activity")
    // Nothing pending -> no button.
    expect(sources([{ ...watches[0]!, lastExtractAt: Date.now() }])).not.toContain("Synthesize new activity")
  })
})

describe("watch signals in the Inbox", () => {
  it("badges an uncited-signal card with the repository it came from", () => {
    const signal = buildInbox({
      ideas: [],
      items: [],
      insights: [
        {
          id: "i-9",
          passId: "p-watch",
          title: "sst/opencode shipped subagents",
          summary: "Parallel sub-agents with their own context. Applies to us: we have the same seat model.",
          evidence: [{ artifactId: "a-9", quote: "Releases: 0.9.0 — subagents" }],
          sourceLabels: ["sst/opencode"],
          createdAt: 5000,
        },
      ],
    })
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <InboxView
          entries={signal}
          inFlight={[]}
          selectedId={null}
          onSelect={() => {}}
          context={{ repoId: "r-1", baseUrl: "http://localhost:4620" }}
          areas={areas}
          showAreas={false}
          onRefresh={async () => {}}
          onSetAside={() => {}}
          onSynthesize={() => {}}
          loading={false}
        />
      </TooltipProvider>,
    )
    expect(html).toContain("sst/opencode")
    expect(html).toContain("sst/opencode shipped subagents")
    expect(html).toContain("Synthesize ideas")
  })
})
