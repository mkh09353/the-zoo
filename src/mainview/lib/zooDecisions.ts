// One verdict, one call.
//
// The Inbox offers the same three gestures on every card — go, not now, and a
// note — but what they MEAN depends on what is being decided, and each meaning
// is already implemented in lib/zoo.ts / lib/zooItemFlow.ts. This module is the
// only place that mapping lives, so the workspace components stay free of
// server access (no new endpoints are introduced here).
//
//   idea  go       -> promote it: create the item + a repo-bound research
//                     session, then deliver the note to that session.
//         not now  -> zooSetIdeaStatus(dismissed).
//   item  go       -> advance one stage, with the note on the decision log.
//         not now  -> drop it, with the note as the reason.
//         note     -> send it to the item's session and log it.

import { zooSetIdeaStatus, type ZooIdea, type ZooItem } from "./zoo"
import { advanceItem, dropItem, latestSessionId, nextStage, promoteIdea, sendItemFeedback } from "./zooItemFlow"

export type DecisionAction = "go" | "not-now" | "note"

export type DecisionOutcome =
  | { ok: true; sessionId?: string }
  | { ok: false; error: string }

export type DecisionContext = {
  repoId?: string | null
  baseUrl?: string | null
}

/** Whether a card's "go" can do anything right now, and why not when it cannot. */
export function goBlockedReason(
  entry: { idea?: ZooIdea; item?: ZooItem },
  context: DecisionContext,
): string | null {
  if (entry.item) {
    return nextStage(entry.item.stage)
      ? null
      : `An item in "${entry.item.stage}" has nowhere left to advance.`
  }
  if (entry.idea) return context.repoId ? null : "Select a repository first."
  return null
}

/** Whether a free-text note has somewhere to go on this card. */
export function noteTarget(entry: { idea?: ZooIdea; item?: ZooItem }): "session" | "log" | "go-only" {
  if (entry.item) return latestSessionId(entry.item) ? "session" : "log"
  return "go-only"
}

async function decideIdea(
  idea: ZooIdea,
  action: DecisionAction,
  note: string,
  context: DecisionContext,
): Promise<DecisionOutcome> {
  if (action === "not-now") {
    const result = await zooSetIdeaStatus(idea.id, "dismissed")
    return result.ok ? { ok: true } : { ok: false, error: result.error }
  }
  if (action === "note") {
    return { ok: false, error: "This idea has no session yet — send it with Go." }
  }

  const promoted = await promoteIdea(idea, context.repoId ?? null, { baseUrl: context.baseUrl })
  if (!promoted.ok) return { ok: false, error: promoted.error }

  const trimmed = note.trim()
  if (!trimmed) {
    return promoted.sessionId ? { ok: true, sessionId: promoted.sessionId } : { ok: true }
  }
  // The verdict already landed; a failed note must not read as a failed promote.
  const delivered = await sendItemFeedback(promoted.item, trimmed, { baseUrl: context.baseUrl })
  if (!delivered.ok) {
    return { ok: false, error: `Promoted, but the note could not be delivered: ${delivered.error}` }
  }
  return promoted.sessionId ? { ok: true, sessionId: promoted.sessionId } : { ok: true }
}

async function decideItemAction(
  item: ZooItem,
  action: DecisionAction,
  note: string,
  context: DecisionContext,
): Promise<DecisionOutcome> {
  const trimmed = note.trim()
  if (action === "note") {
    const result = await sendItemFeedback(item, trimmed, { baseUrl: context.baseUrl })
    return result.ok
      ? { ok: true, ...(result.sessionId ? { sessionId: result.sessionId } : {}) }
      : { ok: false, error: result.error }
  }
  const result =
    action === "go"
      ? await advanceItem(item, trimmed || undefined)
      : await dropItem(item, trimmed || undefined)
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

/**
 * Apply a verdict to whatever the card is about. Returns a plain outcome the
 * caller shows inline; the caller refreshes the board afterwards either way.
 */
export function decide(
  entry: { idea?: ZooIdea; item?: ZooItem },
  action: DecisionAction,
  note: string,
  context: DecisionContext,
): Promise<DecisionOutcome> {
  if (entry.item) return decideItemAction(entry.item, action, note, context)
  if (entry.idea) return decideIdea(entry.idea, action, note, context)
  return Promise.resolve({ ok: false, error: "Nothing to decide on this card." })
}
