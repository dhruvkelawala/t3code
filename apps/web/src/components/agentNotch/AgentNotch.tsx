import { useLocation, useRouter } from "@tanstack/react-router";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { SparklesIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { buildThreadRouteParams, isThreadRoutePathname } from "../../threadRoutes";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useProjects } from "../../state/entities";
import { useThreadFamily } from "../../state/threads";
import { useUiStateStore } from "../../uiStateStore";
import { useThreadSelectionStore } from "../../threadSelectionStore";
import { usePanelAnimationSettings } from "../../panelAnimations";
import { cn } from "../../lib/utils";
import { useSidebar } from "../ui/sidebar";
import { useAgentNotchActive, useTimelinePeek } from "./useTimelinePeek";
import { resolveProjectStatusIndicator, type ThreadStatusPill } from "../Sidebar.logic";
import { agentProjectKey, needsUser, summarizeAgentSessions } from "./agentNotch.logic";
import { useAgentNotchProjects, type AgentNotchProject } from "./useAgentNotchProjects";
import { AgentNotchCard } from "./AgentNotchCard";
import { AgentCharacter } from "./AgentCharacter";
import styles from "./agentNotch.module.css";
import { observeResize } from "../../lib/observeResize";
import { useStableCallback } from "../../hooks/useStableCallback";

export function AgentNotch() {
  const active = useAgentNotchActive();
  return active ? <Notch /> : null;
}

function Notch() {
  const concealed = useTimelinePeek();
  const { state } = useSidebar();
  const items = useAgentNotchProjects();
  const projects = useProjects();
  const scope = useUiStateStore((store) => store.sidebarProjectScopeKeys);
  const scale = useUiStateStore((store) => NOTCH_SCALE[store.agentNotchSize]);
  const corner = useUiStateStore((store) => store.agentNotchCorner);
  const pathname = useLocation({ select: (location) => location.pathname });
  const router = useRouter();
  const animation = usePanelAnimationSettings();
  const [open, setOpen] = useState(false);
  const shown = open && !concealed;
  const [pinned, setPinned] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [height, setHeight] = useState(268);
  const [radius, setRadius] = useState(0);
  const [card, setCard] = useState<NotchCardState | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const rovingIndex = Math.min(focusedIndex, Math.max(0, items.length - 1));
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const cardBody = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const focusOnOpen = useRef(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attention = resolveProjectStatusIndicator(
    items
      .flatMap((item) =>
        item.offline ? [] : [item.status, ...item.sessions.map((session) => session.status)],
      )
      .filter(needsUser),
  );
  const cancelClose = () => clearTimeout(closeTimer.current);
  const close = useStableCallback((restoreFocus = false) => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    focusOnOpen.current = false;
    setOpen(false);
    setPinned(false);
    setActive(null);
    if (restoreFocus) handle.current?.focus();
  });
  const enter = () => {
    cancelClose();
  };
  const leave = () => {
    clearTimeout(openTimer.current);
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setActive(null);
      if (!pinned) close();
    }, 250);
  };
  const point = (key: string, item: HTMLElement) => {
    const disc = item.firstElementChild?.getBoundingClientRect();
    const top = root.current?.getBoundingClientRect().top ?? 0;
    const y = disc ? (disc.top + disc.height / 2 - top) / scale : 0;
    setCard((current) => ({
      key,
      previous: current && current.key !== key ? current.key : (current?.previous ?? null),
      y,
      glide: active !== null && active !== key,
    }));
    setActive(key);
  };
  const openFromKeyboard = () => {
    clearTimeout(openTimer.current);
    cancelClose();
    if (open) {
      focusFirstButton(panel.current);
    } else {
      focusOnOpen.current = true;
      setOpen(true);
    }
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- measures the notch body so its outline follows the viewport, project count and CSS radius
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const measure = () => {
      setRadius(Number.parseFloat(getComputedStyle(element).borderTopRightRadius));
      setHeight(element.offsetHeight + 2 * OPEN.flare);
    };
    measure();
    return observeResize(element, measure);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- corner and scale change the panel's CSS radius, which the measurement reads
  }, [corner, scale]);

  const cardKey = card?.key;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- measures the card's current content so the card can resize as it glides between agents
  useLayoutEffect(() => {
    const element = [...(cardBody.current?.children ?? [])].find(
      (layer) => layer instanceof HTMLElement && layer.dataset.cardKey === cardKey,
    );
    if (!(element instanceof HTMLElement)) return;
    return observeResize(element, () => setCardHeight(element.offsetHeight));
  }, [cardKey]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keyboard opening transfers focus after the agents become interactive
  useLayoutEffect(() => {
    if (open && focusOnOpen.current) {
      focusOnOpen.current = false;
      focusFirstButton(panel.current);
    }
  }, [open]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- dismisses this overlay from native outside clicks and Escape and releases hover timers on unmount
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        root.current?.contains(event.target) ||
        event.target.closest("[data-agent-notch-card]")
      )
        return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!open || event.key !== "Escape") return;
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"], [role="alertdialog"]')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    };
  }, [open, close]);

  const activate = (item: AgentNotchProject) => {
    if (item.offline) return;
    const ref = scopeThreadRef(item.agent.environmentId, item.agent.id);
    useThreadSelectionStore.getState().clearSelection();
    useThreadSelectionStore.getState().setAnchor(scopedThreadKey(ref));
    useUiStateStore.getState().setSidebarProjectScopeKeys([item.projectScopeKey]);
    void router.navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
    close();
  };
  const viewport = window.innerHeight / scale;
  const cardTop = card
    ? Math.min(Math.max(card.y - cardHeight / 2, 8 - viewport / 2), viewport / 2 - 8 - cardHeight)
    : 0;
  const tailTop = card
    ? Math.min(Math.max(card.y - cardTop - 16, 16), Math.max(16, cardHeight - 48))
    : 0;
  const bulge = notchOutline({ ...OPEN, height: height - 2 * OPEN.flare, corner: radius }, height);
  const tab = notchOutline(TAB, height);
  const duration = animation.active ? Math.min(180, animation.durationMs) : 0;
  return (
    <div
      ref={root}
      className={styles["agent-notch"]}
      data-app-sidebar=""
      data-open={shown}
      data-concealed={concealed}
      data-corner={corner}
      style={
        {
          left: state === "expanded" ? "var(--sidebar-width)" : "0px",
          "--agent-notch-scale": scale,
          "--agent-notch-height": `${height}px`,
          "--agent-notch-bulge": bulge.fill,
          "--agent-notch-bulge-edge": bulge.edge,
          "--agent-notch-tab": tab.fill,
          "--agent-notch-tab-edge": tab.edge,
          "--agent-notch-bulge-highlight": bulge.highlight,
          "--agent-notch-tab-highlight": tab.highlight,
          "--agent-notch-unfold-duration": `${duration * 2}ms`,
          "--agent-notch-fold-duration": `${duration}ms`,
          "--agent-notch-peek-duration": `${Math.round((duration * 120) / 180)}ms`,
          // The card fades over 160 ms and glides over 500 ms at a 180 ms panel duration.
          "--agent-notch-card-fade": `${Math.round((duration * 160) / 180)}ms`,
          "--agent-notch-glide-duration": `${Math.round((duration * 500) / 180)}ms`,
        } as CSSProperties
      }
      onPointerEnter={enter}
      onPointerLeave={leave}
    >
      {projects.map((project) => {
        const key = agentProjectKey(project);
        const pointer = project.agentThreadId;
        return pointer ? (
          <ProjectAgentLease key={key} environmentId={project.environmentId} threadId={pointer} />
        ) : null;
      })}
      <button
        ref={handle}
        type="button"
        className={styles["agent-notch-handle"]}
        aria-label="Open agent notch"
        aria-expanded={shown}
        aria-controls="agent-notch-panel"
        onFocus={(event) => {
          if (!root.current?.contains(event.relatedTarget)) setOpen(true);
        }}
        onBlur={(event) => {
          if (!root.current?.contains(event.relatedTarget)) leave();
        }}
        onPointerEnter={() => {
          enter();
          if (!open) openTimer.current = setTimeout(() => setOpen(true), 80);
        }}
        onClick={(event) => {
          if (event.detail === 0) openFromKeyboard();
          else {
            cancelClose();
            setOpen(true);
            if (open) setPinned(true);
          }
        }}
        onKeyDown={(event) => {
          if (["Enter", " ", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
            openFromKeyboard();
          }
        }}
      >
        {attention && <span className={cn(styles["agent-notch-attention"], attention.dotClass)} />}
      </button>
      <div className={styles["agent-notch-outline"]}>
        <div className={styles["agent-notch-surface"]} />
        <svg aria-hidden="true" className={styles["agent-notch-edge"]}>
          <path className={styles["agent-notch-highlight"]} />
          <path className={styles["agent-notch-stroke"]} />
        </svg>
      </div>
      <div
        ref={panel}
        id="agent-notch-panel"
        className={styles["agent-notch-panel"]}
        inert={!shown}
        aria-label="Project agents"
        data-tick="0"
      >
        <div
          className={styles["agent-notch-scroll"]}
          data-scroll={items.length > 6}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setActive(null);
              leave();
            }
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
            const next =
              (rovingIndex + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length;
            setFocusedIndex(next);
            buttons[next]?.focus();
          }}
        >
          {items.length === 0 ? (
            <button
              type="button"
              className={styles["agent-notch-item"]}
              aria-label="No project agents yet"
              onFocus={(event) => {
                enter();
                point(EMPTY_CARD, event.currentTarget);
              }}
              onPointerEnter={(event) => {
                enter();
                point(EMPTY_CARD, event.currentTarget);
              }}
            >
              <span className={styles["agent-notch-disc"]}>
                <SessionRing sessions={[]} />
                <SparklesIcon className="size-5 text-muted-foreground" />
              </span>
            </button>
          ) : (
            items.map((item, index) => {
              const summary = summarizeAgentSessions(item.sessions);
              const selected =
                isThreadRoutePathname(
                  pathname,
                  scopeThreadRef(item.agent.environmentId, item.agent.id),
                ) ||
                (scope.length === 1 && scope[0] === item.projectScopeKey);
              return (
                <button
                  key={item.key}
                  type="button"
                  className={styles["agent-notch-item"]}
                  style={{ "--agent-notch-index": index } as CSSProperties}
                  data-selected={selected}
                  data-offline={item.offline}
                  aria-disabled={item.offline}
                  aria-label={`${item.project.title} agent, ${item.character.state}, ${summary.needsYou} need you, ${summary.working} working, ${item.sessions.length} sessions`}
                  tabIndex={rovingIndex === index ? 0 : -1}
                  onFocus={(event) => {
                    enter();
                    setFocusedIndex(index);
                    point(item.key, event.currentTarget);
                  }}
                  onPointerEnter={(event) => {
                    enter();
                    point(item.key, event.currentTarget);
                  }}
                  onClick={() => activate(item)}
                >
                  <span className={styles["agent-notch-disc"]}>
                    <SessionRing sessions={summary.active} />
                    <AgentCharacter
                      {...item.character}
                      size={28}
                      reactive={shown && animation.active}
                    />
                  </span>
                  <span
                    className={cn(
                      styles["agent-notch-label"],
                      summary.needsYou > 0 && summary.active[0]?.status?.colorClass,
                    )}
                    aria-hidden="true"
                  >
                    {summary.active.length > 0 ? summary.active.length : "–"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
      <div
        className={styles["agent-notch-card"]}
        data-agent-notch-card=""
        data-visible={shown && active !== null}
        data-glide={card?.glide ?? false}
        style={
          {
            "--agent-notch-card-top": `${cardTop}px`,
            "--agent-notch-card-height": `${cardHeight}px`,
            "--agent-notch-tail-top": `${tailTop}px`,
          } as CSSProperties
        }
        onPointerEnter={enter}
        onPointerLeave={leave}
      >
        <svg aria-hidden="true" viewBox="0 0 29.5 32" className={styles["agent-notch-tail"]}>
          <path d={`${TAIL_EDGE} H29.5 V0 Z`} className={styles["agent-notch-tail-fill"]} />
          <path d={TAIL_EDGE} className={styles["agent-notch-tail-edge"]} />
        </svg>
        <div
          ref={cardBody}
          className={cn(
            styles["agent-notch-card-body"],
            "rounded-lg border bg-popover text-popover-foreground",
          )}
        >
          {[card?.previous, card?.key].map((key) => {
            if (!key) return null;
            const item = items.find((candidate) => candidate.key === key);
            return (
              <div
                key={key}
                data-card-key={key}
                className={styles["agent-notch-card-layer"]}
                data-current={key === card?.key}
                aria-hidden={key !== card?.key}
              >
                {key === EMPTY_CARD ? (
                  <p className="text-xs">
                    No project agents yet. Pin a thread, or choose{" "}
                    <strong>Make project agent</strong> from a thread’s menu.
                  </p>
                ) : item ? (
                  <AgentNotchCard item={item} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const RING_RADIUS = 19.1;

function SessionRing({
  sessions,
}: {
  sessions: readonly { thread: { id: string }; status: ThreadStatusPill | null }[];
}) {
  const share = 100 / Math.max(1, sessions.length);
  const gap = sessions.length > 1 ? Math.min(5, share / 2) : 0;
  return (
    <svg aria-hidden="true" viewBox="0 0 44 44" className={styles["agent-notch-ring"]}>
      <circle cx="22" cy="22" r={RING_RADIUS} className={styles["agent-notch-track"]} />
      {sessions.map(({ thread, status }, index) => (
        <circle
          key={thread.id}
          cx="22"
          cy="22"
          r={RING_RADIUS}
          pathLength={100}
          strokeDasharray={`${share - gap} ${100 - share + gap}`}
          strokeDashoffset={-index * share}
          className={cn(styles["agent-notch-arc"], status?.colorClass ?? "text-muted-foreground")}
        />
      ))}
    </svg>
  );
}

function ProjectAgentLease({
  environmentId,
  threadId,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
}) {
  useThreadFamily(environmentId, threadId);
  return null;
}

function focusFirstButton(element: HTMLElement | null) {
  element?.querySelector<HTMLButtonElement>("button")?.focus();
}

type NotchCardState = { key: string; previous: string | null; y: number; glide: boolean };

const EMPTY_CARD = "empty";

// A speech-bubble tail, 28 × 32: it leaves the card tangent to its edge and ends in a point on the disc.
const TAIL_EDGE = "M28.5 0 C28.5 8 11.76 12.16 0 16 C11.76 19.84 28.5 24 28.5 32";

// Pixel values here and in the CSS are drawn at Large; each smaller size is 0.8 of the next.
const NOTCH_SCALE = { small: 0.64, medium: 0.8, large: 1 };
const TAB = { width: 9, height: 72, flare: 10, corner: 4.5 };
const OPEN = { width: 60, flare: 12 };

function notchOutline({ width, height, flare, corner }: typeof TAB, canvasHeight: number) {
  const r = Math.min(corner, width, height / 2);
  const sx = Math.min(flare, Math.max(0, width - r));
  const top = (canvasHeight - height) / 2;
  const bottom = top + height;
  const edge = [
    `M0 ${top - flare}`,
    `A${sx} ${flare} 0 0 0 ${sx} ${top}`,
    `L${width - r} ${top}`,
    `A${r} ${r} 0 0 1 ${width} ${top + r}`,
    `L${width} ${bottom - r}`,
    `A${r} ${r} 0 0 1 ${width - r} ${bottom}`,
    `L${sx} ${bottom}`,
    `A${sx} ${flare} 0 0 0 0 ${bottom + flare}`,
  ].join(" ");
  return {
    edge: `path("${edge}")`,
    fill: `path("${edge} Z")`,
    highlight: `path("M0.75 ${top - flare * 0.35} L0.75 ${bottom + flare * 0.35}")`,
  };
}
