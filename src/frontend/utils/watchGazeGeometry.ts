import type { PageWatcher } from "@linkasu/tobii-electron/renderer";

export function watchGazeGeometry(watcher: Pick<PageWatcher, "watchElementsChange">) {
  let frame: number | undefined;
  let forceRefresh = false;
  let targets: Element[] = [];
  const schedule = (force = false) => {
    forceRefresh ||= force;
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      const force = forceRefresh;
      forceRefresh = false;
      watcher.watchElementsChange(force);
    });
  };
  const resize = new ResizeObserver(() => schedule());
  resize.observe(document.documentElement);
  const observe = () => {
    const next = [...document.getElementsByClassName("eye")];
    const changed =
      next.length !== targets.length || next.some((target, i) => target !== targets[i]);
    if (changed) {
      targets = next;
      resize.disconnect();
      resize.observe(document.documentElement);
      for (const element of targets) resize.observe(element);
    }
    // PageWatcher compares bounds only, so replacing a target must also refresh its identity.
    schedule(changed);
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
