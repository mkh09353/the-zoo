// The Zoo's attention queue: what lands in the Inbox and in which order.
// Run with: bun test src/mainview/lib/zooInbox.test.ts
import { describe, expect, it } from "bun:test"
import {
  buildInbox,
  citedInsightIds,
  ideaForItem,
  inFlightItems,
  insightsForIdea,
  itemsByStage,
} from "./zooInbox"
import type { ZooIdea, ZooInsight, ZooItem } from "./zoo"

const insight = (over: Partial<ZooInsight> & { id: string }): ZooInsight => ({
  passId: "p-1",
  title: `Insight ${over.id}`,
  summary: "Something users keep hitting.",
  evidence: [{ artifactId: "a-1", quote: "It failed silently again." }],
  createdAt: 1000,
  ...over,
})

const idea = (over: Partial<ZooIdea> & { id: string }): ZooIdea => ({
  type: "build",
  title: `Idea ${over.id}`,
  rationale: "Because the evidence says so.",
  status: "proposed",
  insightIds: [],
  createdAt: 1000,
  ...over,
})

const item = (over: Partial<ZooItem> & { id: string }): ZooItem => ({
  ideaId: "d-1",
  title: `Item ${over.id}`,
  stage: "research",
  sessionIds: [],
  decisions: [],
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
})

describe("buildInbox", () => {
  it("puts waiting items ahead of proposed ideas ahead of loose insights", () => {
    const entries = buildInbox({
      ideas: [idea({ id: "d-1", createdAt: 5000 })],
      items: [item({ id: "t-1", stage: "decision", updatedAt: 100 })],
      insights: [insight({ id: "i-1", passId: "p-9", createdAt: 9000 })],
    })
    expect(entries.map((entry) => entry.id)).toEqual(["item:t-1", "idea:d-1", "insights:p-9"])
    expect(entries[0]?.kind).toBe("item")
    expect(entries[0]?.why).toContain("Research came back")
  })

  it("only queues items parked on a human decision", () => {
    const entries = buildInbox({
      ideas: [],
      items: [
        item({ id: "t-1", stage: "research" }),
        item({ id: "t-2", stage: "decision" }),
        item({ id: "t-3", stage: "building" }),
        item({ id: "t-4", stage: "review" }),
        item({ id: "t-5", stage: "shipped" }),
        item({ id: "t-6", stage: "dropped" }),
      ],
      insights: [],
    })
    expect(entries.map((entry) => entry.item?.id)).toEqual(["t-2", "t-4"])
  })

  it("only queues proposed ideas", () => {
    const entries = buildInbox({
      ideas: [
        idea({ id: "d-1", status: "proposed" }),
        idea({ id: "d-2", status: "promoted" }),
        idea({ id: "d-3", status: "dismissed" }),
      ],
      items: [],
      insights: [],
    })
    expect(entries.map((entry) => entry.idea?.id)).toEqual(["d-1"])
  })

  it("attaches cited evidence to an idea card and to the item it became", () => {
    const insights = [insight({ id: "i-1" }), insight({ id: "i-2" }), insight({ id: "i-3" })]
    const ideas = [idea({ id: "d-1", status: "promoted", insightIds: ["i-1", "i-2", "gone"] })]
    const entries = buildInbox({
      ideas,
      items: [item({ id: "t-1", ideaId: "d-1", stage: "review" })],
      insights,
    })
    expect(entries).toHaveLength(2)
    expect(entries[0]?.insights.map((row) => row.id)).toEqual(["i-1", "i-2"])
    expect(entries[0]?.idea?.id).toBe("d-1")
    // i-3 is cited by nobody, so it becomes the loose-signal card.
    expect(entries[1]?.kind).toBe("insights")
    expect(entries[1]?.insights.map((row) => row.id)).toEqual(["i-3"])
  })

  it("groups uncited insights per pass and titles them by count", () => {
    const entries = buildInbox({
      ideas: [],
      items: [],
      insights: [
        insight({ id: "i-1", passId: "p-1", createdAt: 10 }),
        insight({ id: "i-2", passId: "p-1", createdAt: 30 }),
        insight({ id: "i-3", passId: "p-2", createdAt: 20 }),
      ],
    })
    expect(entries.map((entry) => entry.id)).toEqual(["insights:p-1", "insights:p-2"])
    expect(entries[0]?.title).toBe("2 fresh signals with nothing proposed yet")
    expect(entries[1]?.title).toBe("1 fresh signal with nothing proposed yet")
    // Newest pass first, and newest insight first inside the group.
    expect(entries[0]?.at).toBe(30)
    expect(entries[0]?.insights.map((row) => row.id)).toEqual(["i-2", "i-1"])
  })

  it("sorts same-urgency entries newest first, with a deterministic tiebreak", () => {
    const entries = buildInbox({
      ideas: [
        idea({ id: "d-1", createdAt: 100 }),
        idea({ id: "d-2", createdAt: 900 }),
        idea({ id: "d-3", createdAt: 900 }),
      ],
      items: [],
      insights: [],
    })
    expect(entries.map((entry) => entry.idea?.id)).toEqual(["d-2", "d-3", "d-1"])
  })

  it("drops entries the user set aside in this session", () => {
    const input = {
      ideas: [idea({ id: "d-1" })],
      items: [item({ id: "t-1", stage: "decision" })],
      insights: [insight({ id: "i-1", passId: "p-3" })],
    }
    expect(buildInbox({ ...input, dismissed: ["idea:d-1", "insights:p-3"] }).map((e) => e.id)).toEqual([
      "item:t-1",
    ])
  })

  it("returns nothing for an empty board", () => {
    expect(buildInbox({ ideas: [], items: [], insights: [] })).toEqual([])
  })
})

describe("board helpers", () => {
  it("indexes cited insights and resolves them in citation order", () => {
    const ideas = [idea({ id: "d-1", insightIds: ["i-2", "i-1"] })]
    expect([...citedInsightIds(ideas)]).toEqual(["i-2", "i-1"])
    const resolved = insightsForIdea(ideas[0]!, new Map([["i-1", insight({ id: "i-1" })]]))
    expect(resolved.map((row) => row.id)).toEqual(["i-1"])
  })

  it("finds the idea behind an item, or null", () => {
    const ideas = [idea({ id: "d-1" })]
    expect(ideaForItem(item({ id: "t-1", ideaId: "d-1" }), ideas)?.id).toBe("d-1")
    expect(ideaForItem(item({ id: "t-1", ideaId: "nope" }), ideas)).toBeNull()
  })

  it("lists in-flight work newest first and groups the board by stage", () => {
    const items = [
      item({ id: "t-1", stage: "research", updatedAt: 10 }),
      item({ id: "t-2", stage: "building", updatedAt: 40 }),
      item({ id: "t-3", stage: "shipped", updatedAt: 50 }),
    ]
    expect(inFlightItems(items).map((row) => row.id)).toEqual(["t-2", "t-1"])
    const columns = itemsByStage(items, ["research", "shipped", "dropped"])
    expect(columns.map((column) => [column.stage, column.items.length])).toEqual([
      ["research", 1],
      ["shipped", 1],
      ["dropped", 0],
    ])
  })
})
