import type { ProjectIconColor } from "@t3tools/contracts";
import { cn } from "../../lib/utils";
import { projectIconColorClassName } from "../../projectIconColors";
import type { AgentCharacterState } from "./agentCharacter.logic";
import styles from "./agentCharacter.module.css";

export function AgentCharacter({
  cord,
  state,
  color,
  size,
  reactive = false,
}: {
  cord: number;
  state: AgentCharacterState;
  color: ProjectIconColor;
  size: number;
  reactive?: boolean;
}) {
  const needsYou = state === "needs you";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 36 36"
      width={size}
      height={size}
      className={cn(styles.character, projectIconColorClassName(color))}
      data-state={state}
      data-reactive={reactive}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g className={styles.reaction}>
        <g>
          <path d={CORDS[cord]} stroke="currentColor" strokeWidth="4.1" />
          <circle cx="18" cy="19" r="6.2" fill="var(--background)" />
          {state === "offline" ? (
            <path d="M14 19h8" className={styles.eye} strokeWidth="1.8" />
          ) : state === "just finished" ? (
            <path d="M13.8 20q4.2 -7 8.4 0" className={styles.eye} strokeWidth="2.5" />
          ) : state === "failed" ? (
            <path d="M15 16l6 6m0 -6 -6 6" className={styles.eye} strokeWidth="2.3" />
          ) : (
            <g className={styles.blink}>
              <circle cx="18" cy="19" r={needsYou ? 5.7 : 5} className={styles.iris} />
              <circle
                cx="18"
                cy={needsYou ? 17.5 : 19}
                r={needsYou ? 2.7 : 2.3}
                fill="var(--background)"
                className={styles.pupil}
              />
            </g>
          )}
        </g>
      </g>
      <CharacterMark state={state} />
    </svg>
  );
}

function CharacterMark({ state }: { state: AgentCharacterState }) {
  if (state === "needs you") {
    return (
      <g className={MARK_COLORS.needsYou}>
        <path
          d="M24 1h9a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-4l-4 3v-3h-1a2 2 0 0 1 -2 -2V3a2 2 0 0 1 2 -2Z"
          fill="currentColor"
          stroke="var(--popover)"
          strokeWidth="1.2"
        />
        <path d="M28.5 4v3.7" stroke="var(--background)" strokeWidth="1.8" />
        <circle cx="28.5" cy="10" r="1" fill="var(--background)" />
      </g>
    );
  }
  if (state === "just finished" || state === "failed") {
    return (
      <g className={state === "just finished" ? MARK_COLORS.finished : MARK_COLORS.failed}>
        <circle
          cx="29"
          cy="7"
          r="5.5"
          fill="currentColor"
          stroke="var(--popover)"
          strokeWidth="1.1"
        />
        <path
          d={
            state === "just finished"
              ? "M26.4 7.1 28.2 9 31.7 5.2"
              : "M27.2 5.2l3.6 3.6m0 -3.6 -3.6 3.6"
          }
          stroke="var(--background)"
          strokeWidth="1.7"
        />
      </g>
    );
  }
  if (state === "working") {
    return (
      <g className={MARK_COLORS.working} stroke="currentColor" strokeWidth="2">
        <path d="M26 3h3" />
        <path d="M28 7h5" />
      </g>
    );
  }
  return null;
}

const CORDS = [
  "M8 30V14Q8 5 18 5T28 14V25",
  "M30 29H13Q5 29 5 21V13Q5 5 13 5H27V10",
  "M7 6H29L8 30H29",
  "M5 29 18 4 31 29H24",
  "M6 8H23Q30 8 30 15V22Q30 29 23 29H12Q6 29 6 23V20",
  "M5 29V7H17V29H30V7",
  "M18 3 31 18 18 31 5 18 10 12",
  "M5 28V13Q5 7 11 7T17 13V23Q17 29 23 29T29 23V8",
];

/* oxlint-disable shadcn/no-raw-colors -- matches the status-dot palette in Sidebar.logic.ts */
const MARK_COLORS = {
  needsYou: "text-indigo-500 dark:text-indigo-300/90",
  finished: "text-emerald-500 dark:text-emerald-300/90",
  failed: "text-red-500 dark:text-red-300/90",
  working: "text-sky-500 dark:text-sky-300/80",
};
/* oxlint-enable shadcn/no-raw-colors */
