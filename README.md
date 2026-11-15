# FeedLens — See what's in focus in your feed

FeedLens is a local Chrome extension that tracks posts you see and expand in your social feed. Describe your interests in your own words, and TypeSafe's Jev API classifies posts as **In Focus** or **Off Topic**. The side panel shows today's activity, monthly history, and settings. FeedLens tracks topic matches. It does not detect AI-generated content.

## Overview

- **Today** shows all posts viewed today, the **In Focus** and **Off Topic** totals, and a breakdown by interest.
- **History** shows monthly totals and a daily chart for the selected month. Green represents In Focus and red represents Off Topic. Darker segments show expanded posts within each total.
- **Settings** manages the API key, monitored networks, and interests. **Delete All Data** asks for confirmation before clearing history, interests, the API key, and local preferences.

The status button opens Settings. **Set Up** means the API key or an interest is missing. **Paused** means monitoring is disabled for the selected network. **Active** means capture is enabled. API responses are handled separately. If the feed is open and the counters stay at zero after reloading the extension, refresh the LinkedIn tab. Changes to LinkedIn's page structure can also affect capture.

#### Video Demo: TODO — Add the CS50 demo video link.



> **Contributions are welcome!** Help improve FeedLens or add support for a new social feed. LinkedIn is supported today. The other networks below are open for contributions.

| Status | Network | Contributor |
| :---: | --- | --- |
| ✅ | LinkedIn | Iury Cavalcante |
| | Reddit | |
| | Bluesky | |
| | Mastodon | |
| | Threads | |
| | X | |
| | Facebook | |
| | Instagram | |
| | Tumblr | |
| | Pinterest | |

To add a network, create a JavaScript adapter such as `reddit.js` using `linkedin.js` as a reference. The adapter identifies the feed, finds posts, and detects when users expand their text. Register the network and its domains in `networks.js`, then add a `content_scripts` entry in `manifest.json` that loads `networks.js`, the new adapter, and `content.js` in that order. See the [adapter guide](#add-a-network-adapter) for the method names and what to test.



## Install and set up

You need Chrome 116 or later, an internet connection, and a valid TypeSafe API key. FeedLens runs without a build step, Node.js, a server, or a database.

1. Extract the release ZIP if you downloaded it.
2. Open `chrome://extensions`, turn on **Developer mode**, and choose **Load unpacked**.
3. Select the folder containing `manifest.json`.
4. Click the FeedLens toolbar icon to open the side panel.
5. In **Settings**, add at least one interest. Enter your Jev API key, read the notice about sending post text to TypeSafe, and click **Save Settings**.
6. Make sure LinkedIn is enabled under **Monitored Networks**.
7. Open or refresh the LinkedIn feed at `https://www.linkedin.com/feed/` and browse as usual.

To keep your history when upgrading, replace the files in the folder Chrome already uses, click **Reload** on the extension's card, and refresh the LinkedIn tab. Loading a different folder can give the extension a new ID and a separate storage area.



## Project files

| File | Purpose |
|---|---|
| `manifest.json` | Declares permissions, the side panel, and where to inject content scripts. |
| `networks.js` | Registers supported networks and domains and builds record keys. |
| `linkedin.js` | Finds LinkedIn posts, identifiers, text, and expansion controls. |
| `content.js` | Observes visible posts and user clicks, then sends standard events. |
| `background.js` | Validates event sources, records posts, calls Jev, and saves results. |
| `panel.html` | Defines the side panel layout and styles. |
| `panel.js` | Filters and displays counts and manages settings. |

## Add a network adapter

A network adapter implements these methods for the shared content script.

```javascript
const feedlensAdapter = {
  network: "example-network",
  isFeedPage() { /* Return true on the supported feed. */ },
  findPosts() { /* Return the post elements. */ },
  getPostId(element) { /* Return a stable identifier or null. */ },
  getPostText(element) { /* Return the post text. */ },
  findPostForButton(button) { /* Return the post containing the button. */ },
  isExpandButton(button) { /* Return true for a text expansion control. */ }
};
```

1. Create an adapter file that implements the methods above.
2. Register the network and its HTTPS domains in `networks.js`.
3. Add a content script entry in `manifest.json` that loads `networks.js`, the new adapter, and `content.js` in that order for the appropriate URLs.
4. Add any permissions the supported network requires.
5. Test post detection, scrolling, and expansion clicks, and review the platform's terms.

The panel builds its network options from the registry. The service worker checks the sender's actual URL before accepting events for a network.

## Storage and counts

Records use a combination of network, local date, and post ID as their key. Records from earlier versions that lack a network are treated as LinkedIn records.

```json
{
  "network": "linkedin",
  "day": "2026-11-14",
  "id": "urn:li:activity:123",
  "status": "done",
  "category": "relevant",
  "interest": "Technology",
  "opened": true,
  "firstSeenAt": "2026-11-14T13:00:00.000Z",
  "openedAt": "2026-11-14T13:01:00.000Z",
  "classifiedAt": "2026-11-14T13:01:02.000Z"
}
```

- **All Posts** counts each viewed post once per day per network.
- **In Focus** counts posts Jev matched to one saved interest. **Off Topic** counts posts Jev classified without a match.
- **Expanded** counts posts for which FeedLens detected a user click on the text expansion control. Repeat clicks on the same post that day count once.
- **By Interest** counts each In Focus post under its primary interest.
- Posts awaiting classification, with insufficient text, or with a failed API call still count under **All Posts**. The two classification totals can therefore add up to less than **All Posts**.



## Manual checks

1. Confirm that Chrome loads the extension without errors.
2. Save a key and an interest. Disable LinkedIn under **Monitored Networks** and confirm that capture stops. Enable it again for the remaining checks.
3. Scroll the feed and check **All Posts**, **In Focus**, **Off Topic**, and **By Interest**.
4. Expand a post and confirm that the **Expanded** count increases once for that post on that day.
5. If the API is unavailable, confirm that the post counts under **All Posts** while the classification totals stay the same.
6. In **History**, switch between **LinkedIn** and **All networks** and check the daily and monthly totals.
7. When updating an earlier installation, confirm that the old history still appears under LinkedIn.
8. Confirm that the network filter is hidden in **Settings** and that **Delete All Data** clears history, interests, the key, and preferences after confirmation.

## API and privacy

The service worker sends a POST request to `https://api.typesafe.ai/v1/systemone` using the `jev-latest` model and a `choice` question with one option per interest plus `irrelevant`. See the [TypeSafe choice documentation](https://docs.typesafe.ai/primitives/choice).

Saving an API key authorizes FeedLens to send visible post text to TypeSafe. Classification starts once a key and at least one interest are saved and the network is enabled. Chrome stores the key in `chrome.storage.local`, which is restricted to trusted extension contexts. History stores IDs, classifications, expansion status, and timestamps. FeedLens sends post text for classification without saving the full text in history. Keep API keys out of source code.

API calls may incur charges. Changing your interests applies to future classifications. FeedLens reads rendered text and observes clicks. It does not capture images or video or automate interactions.

