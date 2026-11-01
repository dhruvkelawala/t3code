import { useNowMinute } from "../../hooks/useNowMinute";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { cn } from "../../lib/utils";
import { Kbd } from "../ui/kbd";
import type { ThreadStatusPill } from "../Sidebar.logic";
import type { AgentNotchProject } from "./useAgentNotchProjects";
import { AgentCharacter } from "./AgentCharacter";

export function AgentNotchCard({ item }: { item: AgentNotchProject }) {
  return (
    <div className="w-full space-y-3 text-left text-xs">
      <div className="flex items-center gap-2">
        <AgentCharacter {...item.character} size={24} />
        <span className="min-w-0 flex-1 truncate font-semibold text-sm">{item.project.title}</span>
        {item.environmentLabel && (
          <span className="max-w-24 truncate text-muted-foreground">{item.environmentLabel}</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate">{item.agent.title}</span>
        <Status status={item.status} updatedAt={item.agent.updatedAt} />
      </div>
      <div className="space-y-2 border-t border-border pt-3">
        {item.offline ? (
          <p className="text-muted-foreground">Offline</p>
        ) : item.sessions.length === 0 ? (
          <p className="text-muted-foreground">No active sessions</p>
        ) : (
          <>
            {item.sessions.slice(0, MAX_SESSIONS).map(({ thread, status }) => (
              <div key={thread.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{thread.title}</span>
                <Status status={status} updatedAt={thread.updatedAt} />
              </div>
            ))}
            {item.sessions.length > MAX_SESSIONS && (
              <p className="text-muted-foreground">+{item.sessions.length - MAX_SESSIONS} more</p>
            )}
          </>
        )}
      </div>
      {!item.offline && (
        <div className="flex items-center justify-between border-t border-border pt-2 text-muted-foreground">
          <span>Open agent</span>
          <Kbd>↵</Kbd>
        </div>
      )}
    </div>
  );
}

const MAX_SESSIONS = 4;

function Status({ status, updatedAt }: { status: ThreadStatusPill | null; updatedAt: string }) {
  const minute = useNowMinute();
  return (
    <span className={cn("shrink-0 text-2xs", status?.colorClass ?? "text-muted-foreground")}>
      {status ? (
        <span className="inline-flex items-center gap-1">
          <span className={cn("size-1 rounded-full", status.dotClass)} />
          {status.label}
        </span>
      ) : (
        formatRelativeTimeLabel(updatedAt, Date.parse(`${minute}:00.000Z`))
      )}
    </span>
  );
}
