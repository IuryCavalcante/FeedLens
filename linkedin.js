// FeedLens - LinkedIn adapter.
// LinkedIn-specific selectors and expansion controls live here.
// New adapters implement the same methods for content.js.
// AI disclosure: This code was developed with help from ChatGPT for CS50.

const linkedinCard = '[data-testid="mainFeed"] [role="listitem"][componentkey^="update-card-focus"]';
const linkedinPost = [
  linkedinCard,
  '[data-urn^="urn:li:activity:"]',
  ".feed-shared-update-v2",
  '[data-id^="urn:li:activity:"]'
].join(",");

const feedlensAdapter = {
  network: "linkedin",

  isFeedPage() {
    return networkForUrl(location.href) === this.network &&
      (location.pathname === "/" || /^\/feed(?:\/|$)/.test(location.pathname));
  },

  findPosts() {
    return document.querySelectorAll(linkedinPost);
  },

  getPostId(element) {
    const container = element.closest("[data-urn], [data-id]") || element;
    const urn = container.getAttribute("data-urn") ||
      container.getAttribute("data-id") ||
      element.getAttribute("data-urn") ||
      element.getAttribute("data-id");
    if (urn && urn.includes("urn:li:")) return urn;

    const link = element.querySelector('a[href*="/feed/update/urn:li:"]');
    const linkedId = link?.getAttribute("href")?.match(/urn:li:[^/?#]+/)?.[0];
    if (linkedId) return linkedId;
    const cardKey = element.getAttribute("componentkey");
    return cardKey?.match(/^update-card-focus(.+?)(?:FeedType_|$)/)?.[1] || null;
  },

  getPostText(element) {
    const content = element.querySelector(
      '[data-testid="expandable-text-box"], .update-components-text, .feed-shared-text, [data-test-id="main-feed-activity-card__commentary"]'
    );
    return (content?.innerText || element.innerText || "").trim().slice(0, 3500);
  },

  findPostForButton(button) {
    return button.closest(linkedinPost);
  },

  isExpandButton(button) {
    if (button.matches('[data-testid="expandable-text-button"]')) return true;
    const label = (button.innerText || button.getAttribute("aria-label") || "")
      .trim().toLowerCase();
    return /^(…?mais|\.\.\.mais|ver mais|see more|more)(\b|$)/i.test(label);
  }
};
