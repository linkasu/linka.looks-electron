import type { PageWatcher } from "@linkasu/tobii-electron/renderer";

export function watchGazeGeometry(watcher: Pick<PageWatcher, "watchElementsChange">) {
  let frame: number | undefined;
  const schedule = () => {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      watcher.watchElementsChange();
    });
  };
  const resize = new ResizeObserver(schedule);
  const observe = () => {
    resize.disconnect();
    resize.observe(document.documentElement);
    for (const element of document.getElementsByClassName("eye")) resize.observe(element);
    schedule();
  };
  // PageWatcher observes child nodes, but misses final CSS/font/transition layout.
  const mutations = new MutationObserver(observe);
  mutations.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden"]
  });
  observe();
  return () => {
    mutations.disconnect();
    resize.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
  };
}
