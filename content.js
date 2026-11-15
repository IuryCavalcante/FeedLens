// FeedLens - shared feed monitoring across networks.
// Each network adapter handles its own DOM selectors.
// Observes existing page elements and user clicks.
// AI disclosure: This code was developed with help from ChatGPT for CS50.

(() => {
  const adapter = feedlensAdapter;
  const seen = new Set();
  const opened = new Set();
  let observed = new WeakSet();
  let enabled = false;
  let captureGeneration;
  let statusError;

  function localDay() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  async function sendOnce(keys, key, message) {
    if (keys.has(key)) return;
    keys.add(key);
    const generation = captureGeneration;
    try {
      const response = await chrome.runtime.sendMessage(message);
      if (!response?.ok) throw new Error(response?.error || "Capture was not accepted");
    } catch (error) {
      if (captureGeneration === generation) keys.delete(key);
      console.warn("FeedLens could not record the post:", error.message);
    }
  }

  // The adapter identifies which elements are posts.
  function scan() {
    if (!enabled || !adapter.isFeedPage()) return;
    for (const element of adapter.findPosts()) {
      if (observed.has(element)) continue;
      observed.add(element);
      visibilityObserver.observe(element);
    }
  }

  function onVisible(entries) {
    if (!enabled || !adapter.isFeedPage()) return;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = adapter.getPostId(entry.target);
      const day = localDay();
      const key = `${day}|${id}`;
      if (!id) continue;
      sendOnce(seen, key, {
        type: "POST_VISIBLE",
        post: { network: adapter.network, day, id, text: adapter.getPostText(entry.target) }
      });
    }
  }

  // Record user clicks on the text expansion control.
  document.addEventListener("click", event => {
    if (!event.isTrusted || !enabled || !adapter.isFeedPage()) return;
    const button = event.target.closest('button, a, span[role="button"]');
    if (!button || !adapter.isExpandButton(button)) return;

    const element = adapter.findPostForButton(button);
    if (!element) return;
    const id = adapter.getPostId(element);
    if (!id) return;
    const day = localDay();
    const key = `${day}|${id}`;

    // Count expanded posts among the posts viewed.
    sendOnce(seen, key, {
      type: "POST_VISIBLE",
      post: { network: adapter.network, day, id, text: adapter.getPostText(element) }
    });
    sendOnce(opened, key, { type: "POST_OPENED", network: adapter.network, id, day });
  }, true);

  const visibilityObserver = new IntersectionObserver(onVisible);
  const domObserver = new MutationObserver(scan);
  domObserver.observe(document.documentElement, { childList: true, subtree: true });

  async function refreshStatus() {
    let settings;
    try {
      settings = await chrome.runtime.sendMessage({ type: "GET_STATUS", network: adapter.network });
      if (typeof settings?.active !== "boolean") {
        throw new Error(settings?.error || "No capture status returned by the service worker");
      }
      statusError = undefined;
    } catch (error) {
      if (statusError !== error.message) {
        statusError = error.message;
        console.warn("FeedLens could not check capture status:", statusError);
      }
    }
    const active = !!settings?.active;
    const historyCleared = !!settings && captureGeneration !== settings.captureGeneration;
    if (historyCleared) {
      captureGeneration = settings.captureGeneration;
      seen.clear();
      opened.clear();
    }
    if (active !== enabled || historyCleared) {
      visibilityObserver.disconnect();
      observed = new WeakSet();
    }
    enabled = active;
    if (enabled) scan();
  }

  // Storage access is restricted to the panel and service worker.
  window.setInterval(refreshStatus, 3000);
  refreshStatus();
})();
