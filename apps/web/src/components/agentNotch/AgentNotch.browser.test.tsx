import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, fakeTimers, render } from "../../../test/render";
import { updateClientSettings } from "../../hooks/useSettings";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import { useUiStateStore } from "../../uiStateStore";
import { SidebarProvider } from "../ui/sidebar";
import { AgentNotch } from "./AgentNotch";

it("keeps the notch closed when Escape returns focus from outside to the tab", async () => {
  await page.viewport(1280, 900);
  useUiStateStore.setState({
    agentNotchEnabled: true,
    agentNotchSize: "medium",
    agentNotchCorner: "2xl",
  });
  await updateClientSettings({ panelAnimationDurationMs: 180 });
  await using screen = await render(
    <AppAtomRegistryProvider>
      <SidebarProvider>
        <button type="button">Outside the notch</button>
        <AgentNotch />
      </SidebarProvider>
    </AppAtomRegistryProvider>,
  );
  using _timers = fakeTimers();
  const outside = screen.getByRole("button", { name: "Outside the notch" });
  const tab = screen.getByRole("button", { name: "Open agent notch" });
  await outside.click();
  await userEvent.hover(tab);
  await act(() => vi.advanceTimersByTime(80));
  await expect.element(tab).toHaveAttribute("aria-expanded", "true");

  await userEvent.keyboard("{Escape}");

  await expect.element(tab).toHaveFocus();
  await expect.element(tab).toHaveAttribute("aria-expanded", "false");
});
