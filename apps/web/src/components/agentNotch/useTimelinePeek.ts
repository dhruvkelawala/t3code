import { useEffect, useState } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useUiStateStore } from "../../uiStateStore";
import { SIDEBAR_MOBILE_QUERY } from "../ui/sidebar";

// Matches the sidebar's own mobile check without needing its provider, so the timeline renders alone.
export function useAgentNotchActive() {
  const isMobile = useMediaQuery(SIDEBAR_MOBILE_QUERY);
  const enabled = useUiStateStore((state) => state.agentNotchEnabled);
  return enabled && !isMobile;
}

/**
 * True while the composer's alternate modifier (Cmd or Ctrl) is held on its own. The notch
 * and the timeline minimap share the chat's left edge and swap on it. A short hold threshold
 * and chord cancellation keep shortcuts like Cmd+K from flashing the minimap.
 */
export function useTimelinePeek() {
  const [peeking, setPeeking] = useState(false);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window key, paste and blur listeners track a held modifier
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let chorded = false;
    const reset = () => {
      clearTimeout(timer);
      timer = undefined;
      chorded = false;
      setPeeking(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isPeekModifier(event.key)) {
        if (timer === undefined && !chorded) {
          timer = setTimeout(() => setPeeking(true), PEEK_HOLD_MS);
        }
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        clearTimeout(timer);
        chorded = true;
        setPeeking(false);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) reset();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    // Dictation tools can omit the modifier keyup after a synthetic paste.
    window.addEventListener("paste", reset, true);
    window.addEventListener("blur", reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("paste", reset, true);
      window.removeEventListener("blur", reset);
    };
  }, []);

  return peeking;
}

const PEEK_HOLD_MS = 140;

function isPeekModifier(key: string) {
  return key === "Meta" || key === "Control";
}
