// The Board: the pipeline at a glance.
//
// Read-only on purpose — decisions belong in the Inbox. This is where the user
// checks what became of everything: proposed ideas on the left, then the items
// they became, stage by stage. Selecting anything opens it in the detail pane.

import { LayoutGrid } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "~/lib/cn"
import { relativeTime } from "~/lib/format"
import { ITEM_STAGES, type ZooIdea, type ZooItem, type ZooItemStage } from "~/lib/zoo"
import { itemsByStage } from "~/lib/zooInbox"
import { Badge, EmptyState, IDEA_TYPE_LABEL, IDEA_TYPE_TONE, STAGE_LABEL, STAGE_TONE, ViewHeader } from "./parts"

function Column({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <section className="flex w-[15.5rem] min-w-0 shrink-0 flex-col gap-2">
      <h3 className="flex items-center gap-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {title}
        <span className="text-muted-foreground/70">{count}</span>
      </h3>
      <ul className="flex min-w-0 flex-col gap-1.5">{children}</ul>
    </section>
  )
}

function Card({
  title,
  meta,
  badge,
  selected,
  onSelect,
}: {
  title: string
  meta: string
  badge: ReactNode
  selected: boolean
  onSelect: () => void
}) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "flex w-full min-w-0 cursor-pointer flex-col gap-1.5 rounded-xl border bg-card/60 px-3 py-2 text-left",
          selected ? "border-primary/50 ring-1 ring-primary/20" : "border-border/70 hover:border-border",
        )}
      >
        <span className="min-w-0 break-words font-medium text-[12.5px] text-foreground leading-snug">
          {title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {badge}
          <span className="truncate text-[11px] text-muted-foreground">{meta}</span>
        </span>
      </button>
    </li>
  )
}

export function BoardView({
  ideas,
  items,
  selectedId,
  onSelectIdea,
  onSelectItem,
}: {
  ideas: ZooIdea[]
  items: ZooItem[]
  selectedId: string | null
  onSelectIdea: (idea: ZooIdea) => void
  onSelectItem: (item: ZooItem) => void
}) {
  const proposed = ideas.filter((idea) => idea.status === "proposed")
  const columns = itemsByStage(items, ITEM_STAGES as readonly ZooItemStage[])
  const empty = proposed.length === 0 && items.length === 0

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ViewHeader
        title="Board"
        subtitle={`${items.length} item${items.length === 1 ? "" : "s"} · ${proposed.length} idea${proposed.length === 1 ? "" : "s"} awaiting a verdict`}
      />
      {empty ? (
        <EmptyState
          icon={<LayoutGrid className="size-5" />}
          title="Nothing on the board yet"
          body="Ideas land here once a run proposes them, and become items the moment you say go in the Inbox."
        />
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 gap-5 overflow-x-auto overflow-y-auto px-6 pb-8">
          <Column title="Proposed" count={proposed.length}>
            {proposed.map((idea) => (
              <Card
                key={idea.id}
                title={idea.title}
                meta={relativeTime(idea.createdAt)}
                badge={<Badge className={IDEA_TYPE_TONE[idea.type]}>{IDEA_TYPE_LABEL[idea.type]}</Badge>}
                selected={selectedId === `idea:${idea.id}`}
                onSelect={() => onSelectIdea(idea)}
              />
            ))}
          </Column>
          {columns.map(({ stage, items: staged }) => (
            <Column key={stage} title={STAGE_LABEL[stage]} count={staged.length}>
              {staged.map((item) => (
                <Card
                  key={item.id}
                  title={item.title}
                  meta={`${relativeTime(item.updatedAt)} · ${item.sessionIds.length} session${item.sessionIds.length === 1 ? "" : "s"}`}
                  badge={<Badge className={STAGE_TONE[item.stage]}>{STAGE_LABEL[item.stage]}</Badge>}
                  selected={selectedId === `item:${item.id}`}
                  onSelect={() => onSelectItem(item)}
                />
              ))}
            </Column>
          ))}
        </div>
      )}
    </div>
  )
}
