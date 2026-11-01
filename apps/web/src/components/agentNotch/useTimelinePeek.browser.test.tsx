import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../../test/render";
import { useTimelinePeek } from "./useTimelinePeek";

function Probe() {
  return <output aria-label="Timeline peek">{useTimelinePeek() ? "revealed" : "concealed"}</output>;
}

function key(type: "keydown" | "keyup", value: string, modifiers: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent(type, { key: value, ...modifiers }));
}

describe("timeline peek", () => {
  it.each(["Meta", "Control"])(
    "reveals after holding %s alone and resets on release",
    async (modifier) => {
      await using screen = await render(<Probe />, {
        // This hook listens to window events and does not navigate.
        router: false,
      });
      using _timers = fakeTimers();
      const flags = modifier === "Meta" ? { metaKey: true } : { ctrlKey: true };

      await act(() => {
        key("keydown", modifier, flags);
        vi.advanceTimersByTime(139);
      });
      await expect.element(screen.getByLabelText("Timeline peek")).toHaveTextContent("concealed");
      await act(() => vi.advanceTimersByTime(1));
      await expect.element(screen.getByLabelText("Timeline peek")).toHaveTextContent("revealed");
      await act(() => key("keyup", modifier));
      await expect.element(screen.getByLabelText("Timeline peek")).toHaveTextContent("concealed");
    },
  );

  it.each(["before", "after"])(
    "cancels shortcuts %s the hold threshold until modifiers release",
    async (when) => {
      await using screen = await render(<Probe />, {
        // This hook listens to window events and does not navigate.
        router: false,
      });
      using _timers = fakeTimers();
      await act(() => {
        key("keydown", "Meta", { metaKey: true });
        vi.advanceTimersByTime(when === "before" ? 100 : 140);
        key("keydown", "k", { metaKey: true });
        key("keydown", "Meta", { metaKey: true, repeat: true });
        vi.advanceTimersByTime(200);
      });
      await expect.element(screen.getByLabelText("Timeline peek")).toHaveTextContent("concealed");
      await act(() => {
        key("keyup", "Meta");
        key("keydown", "Control", { ctrlKey: true });
        vi.advanceTimersByTime(140);
      });
      await expect.element(screen.getByLabelText("Timeline peek")).toHaveTextContent("revealed");
    },
  );

  it.each(["blur", "paste"])("clears a held modifier on %s", async (event) => {
    await using screen = await render(<Probe />, {
      // This hook listens to window events and does not navigate.
      router: false,
    });
    using _timers = fakeTimers();
    await act(() => {
      key("keydown", "Meta", { metaKey: true });
      vi.advanceTimersByTime(140);
    });
    await expect.element(screen.getByLabelText("Timeline peek")).toHaveTextContent("revealed");
    await act(() => window.dispatchEvent(new Event(event)));
    await expect.element(screen.getByLabelText("Timeline peek")).toHaveTextContent("concealed");
  });

  it.each([{ shiftKey: true }, { altKey: true }, { ctrlKey: true }])(
    "ignores modifier chords: %j",
    async (flags) => {
      await using screen = await render(<Probe />, {
        // This hook listens to window events and does not navigate.
        router: false,
      });
      using _timers = fakeTimers();
      await act(() => {
        key("keydown", "Meta", { metaKey: true, ...flags });
        vi.advanceTimersByTime(140);
      });
      await expect.element(screen.getByLabelText("Timeline peek")).toHaveTextContent("concealed");
    },
  );
});
