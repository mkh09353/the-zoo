// The Zoo's attention queue.
//
// Turns the raw product-factory board (ideas, items, insights) into ONE ordered
// list of decisions waiting on the user. Deliberately pure — no RPC, no React —
// so the "what needs me, and in what order" rules are testable on their own
// (lib/zooInbox.test.ts). Every server round trip lives in lib/zoo.ts and
// lib/zooDecisions.ts.

import type { ZooIdea, ZooIdeaStatus, ZooIdeaType, ZooInsight, ZooItem, ZooItemStage } from "./zoo"

export type InboxKind = "idea" | "item" | "insights"

/**
 * One card in the queue.
 *
 * `urgency` is the primary sort (lower first); `at` breaks ties newest-first.
 * `insights` is the evidence rendered inline on the card and in full in the
 * detail pane — for an item it is resolved through the idea it came from.
 */
export type InboxEntry = {
  id: string
  kind: InboxKind
  title: string
  /** Why this is in front of the user, in one sentence. */
  why: string
  at: number
  urgency: number
  idea?: ZooIdea
  item?: ZooItem
  insights: ZooInsight[]
}

export type InboxInput = {
  ideas: readonly ZooIdea[]
  items: readonly ZooItem[]
  insights: readonly ZooInsight[]
  /** Entry ids the user said "not now" to in this session (client-side only). */
  dismissed?: readonly string[]
}

/** Item stages that mean "a human has to decide something". */
export const WAITING_STAGES: readonly ZooItemStage[] = ["decision", "review"]

/** Item stages that mean "the factory is working on it". */
export const IN_FLIGHT_STAGES: readonly ZooItemStage[] = ["research", "building"]

const WAITING = new Set<string>(WAITING_STAGES)

const IDEA_WHY: Record<ZooIdeaType, string> = {
  build: "A new build proposal is waiting for your verdict.",
  investigate: "The factory wants to dig into this — say go or not now.",
  close: "The factory suggests closing this out. Confirm or push back.",
  "needs-detail": "This needs more detail before it can move.",
}

const ITEM_WHY: Partial<Record<ZooItemStage, string>> = {
  decision: "Research came back. Approve the next step, redirect it, or park it.",
  review: "The work is in review and waiting on your call.",
}

/** Stages that are not decisions still need a line when opened from the Board. */
const ITEM_WHY_FALLBACK: Record<ZooItemStage, string> = {
  research: "The factory is researching this. Nothing is needed from you yet.",
  decision: "Waiting on your call.",
  building: "The factory is building this.",
  review: "Waiting on your review.",
  shipped: "Shipped.",
  dropped: "Dropped — kept for the record.",
}

const IDEA_STATUS_WHY: Record<ZooIdeaStatus, string> = {
  proposed: "Waiting for your verdict.",
  promoted: "Promoted — it has an item on the board.",
  dismissed: "Dismissed. Kept for the record.",
}

export function insightIndex(insights: readonly ZooInsight[]): Map<string, ZooInsight> {
  const map = new Map<string, ZooInsight>()
  for (const insight of insights) map.set(insight.id, insight)
  return map
}

/** Insight ids some idea already cites — i.e. signals that have been used. */
export function citedInsightIds(ideas: readonly ZooIdea[]): Set<string> {
  const cited = new Set<string>()
  for (const idea of ideas) for (const id of idea.insightIds) cited.add(id)
  return cited
}

export function insightsForIdea(
  idea: ZooIdea,
  index: Map<string, ZooInsight>,
): ZooInsight[] {
  const out: ZooInsight[] = []
  for (const id of idea.insightIds) {
    const insight = index.get(id)
    if (insight) out.push(insight)
  }
  return out
}

/** The idea an item was promoted from, if it is still on the board. */
export function ideaForItem(item: ZooItem, ideas: readonly ZooIdea[]): ZooIdea | null {
  return ideas.find((idea) => idea.id === item.ideaId) ?? null
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

function itemEntry(
  item: ZooItem,
  ideas: readonly ZooIdea[],
  index: Map<string, ZooInsight>,
): InboxEntry {
  const idea = ideaForItem(item, ideas)
  return {
    id: `item:${item.id}`,
    kind: "item",
    title: item.title,
    why: ITEM_WHY[item.stage] ?? ITEM_WHY_FALLBACK[item.stage],
    at: item.updatedAt,
    urgency: 0,
    item,
    ...(idea ? { idea } : {}),
    insights: idea ? insightsForIdea(idea, index) : [],
  }
}

function ideaEntry(idea: ZooIdea, index: Map<string, ZooInsight>): InboxEntry {
  return {
    id: `idea:${idea.id}`,
    kind: "idea",
    title: idea.title,
    why: idea.status === "proposed" ? IDEA_WHY[idea.type] : IDEA_STATUS_WHY[idea.status],
    at: idea.createdAt,
    urgency: 1,
    idea,
    insights: insightsForIdea(idea, index),
  }
}

/**
 * The detail-pane view of a single item or idea, including ones that are NOT in
 * the queue (anything opened from the Board). Same shape as a queue card, so the
 * pane has exactly one thing to render.
 */
export function entryForItem(
  item: ZooItem,
  ideas: readonly ZooIdea[],
  insights: readonly ZooInsight[],
): InboxEntry {
  return itemEntry(item, ideas, insightIndex(insights))
}

export function entryForIdea(idea: ZooIdea, insights: readonly ZooInsight[]): InboxEntry {
  return ideaEntry(idea, insightIndex(insights))
}

/**
 * Build the queue.
 *
 * Order of business:
 *   0. items parked on a human decision (research done / in review),
 *   1. proposed ideas awaiting a verdict,
 *   2. insights from a synthesis run that no idea cites yet, grouped per pass.
 *
 * Shipped/dropped items, promoted/dismissed ideas and already-cited insights
 * are not decisions — they belong to the Board, not the Inbox.
 */
export function buildInbox(input: InboxInput): InboxEntry[] {
  const index = insightIndex(input.insights)
  const cited = citedInsightIds(input.ideas)
  const dismissed = new Set(input.dismissed ?? [])
  const entries: InboxEntry[] = []

  for (const item of input.items) {
    if (!WAITING.has(item.stage)) continue
    entries.push(itemEntry(item, input.ideas, index))
  }

  for (const idea of input.ideas) {
    if (idea.status !== "proposed") continue
    entries.push(ideaEntry(idea, index))
  }

  const byPass = new Map<string, ZooInsight[]>()
  for (const insight of input.insights) {
    if (cited.has(insight.id)) continue
    const group = byPass.get(insight.passId)
    if (group) group.push(insight)
    else byPass.set(insight.passId, [insight])
  }
  for (const [passId, group] of byPass) {
    const at = group.reduce((newest, insight) => Math.max(newest, insight.createdAt), 0)
    entries.push({
      id: `insights:${passId}`,
      kind: "insights",
      title: `${plural(group.length, "fresh signal")} with nothing proposed yet`,
      why: "A run recorded these insights and no idea cites them. Synthesize them into proposals, or set them aside.",
      at,
      urgency: 2,
      insights: [...group].sort((a, b) => b.createdAt - a.createdAt),
    })
  }

  return entries
    .filter((entry) => !dismissed.has(entry.id))
    .sort((a, b) => a.urgency - b.urgency || b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Items the factory is actively working (the "in flight" strip, not a decision). */
export function inFlightItems(items: readonly ZooItem[]): ZooItem[] {
  const stages = new Set<string>(IN_FLIGHT_STAGES)
  return items
    .filter((item) => stages.has(item.stage))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Items grouped by stage, in pipeline order — the Board view's columns. */
export function itemsByStage(
  items: readonly ZooItem[],
  stages: readonly ZooItemStage[],
): { stage: ZooItemStage; items: ZooItem[] }[] {
  return stages.map((stage) => ({
    stage,
    items: items.filter((item) => item.stage === stage).sort((a, b) => b.updatedAt - a.updatedAt),
  }))
}
