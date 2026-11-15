// FeedLens - Jev classification, events, and storage (Manifest V3).
// Post text is transient, and the API key stays in trusted extension contexts.
// AI disclosure: This code was developed with help from ChatGPT for CS50.

importScripts("networks.js");

const API_URL = "https://api.typesafe.ai/v1/systemone";
const pendingClassifications = new Set();
let apiQueue = Promise.resolve();
let writeQueue = Promise.resolve();

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});

// Migrate legacy day|id keys to linkedin|day|id.
// This keeps older records visible in History.
function normalizeRecords(records = {}) {
  const result = {};
  for (const post of Object.values(records)) {
    if (!post || typeof post.id !== "string" || typeof post.day !== "string") continue;
    const network = FeedLensNetworks[post.network] ? post.network : "linkedin";
    const key = recordKey(network, post.day, post.id);
    const previous = result[key];
    if (!previous || (previous.status !== "done" && post.status === "done")) {
      result[key] = { ...post, network, opened: !!(post.opened || previous?.opened) };
    } else {
      previous.opened = previous.opened || !!post.opened;
    }
  }
  return result;
}

// Serialize writes so an expansion can be recorded
// even when an API response arrives at the same time.
function changeRecord(network, day, id, update) {
  const operation = writeQueue.then(async () => {
    const data = await chrome.storage.local.get("records");
    const records = normalizeRecords(data.records);
    const key = recordKey(network, day, id);
    const current = records[key] || { network, day, id, opened: false, status: "pending" };
    records[key] = update(current);
    await chrome.storage.local.set({ records });
    return records[key];
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

chrome.runtime.onInstalled.addListener(() => {
  const migration = writeQueue.then(async () => {
    const data = await chrome.storage.local.get("records");
    if (data.records) await chrome.storage.local.set({ records: normalizeRecords(data.records) });
  });
  writeQueue = migration.catch(() => {});
});

function validDay(day) {
  return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day);
}

function validId(id) {
  return typeof id === "string" && id.length > 0 && id.length <= 400;
}

function validPost(post) {
  return post && FeedLensNetworks[post.network] && validDay(post.day) &&
    validId(post.id) && typeof post.text === "string" && post.text.length <= 3500;
}

function isActive(settings, network) {
  return !!(settings.apiKey &&
    settings.interests?.length && settings.networksEnabled?.[network] !== false);
}

// Verify the reported network against the sender's URL.
function validSender(sender, network) {
  return FeedLensNetworks[network] && networkForUrl(sender.url || sender.tab?.url) === network;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !validSender(sender, message.network || message.post?.network)) return;
  const network = message.network || message.post?.network;

  if (message.type === "GET_STATUS") {
    chrome.storage.local.get(["apiKey", "interests", "networksEnabled", "captureGeneration"])
      .then(settings => sendResponse({
        active: isActive(settings, network),
        captureGeneration: settings.captureGeneration
      }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === "POST_VISIBLE" && validPost(message.post)) {
    receiveVisible(message.post).then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === "POST_OPENED" && validDay(message.day) && validId(message.id)) {
    markOpened(network, message.day, message.id).then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

async function receiveVisible(post) {
  const settings = await chrome.storage.local.get(["apiKey", "interests", "networksEnabled"]);
  if (!isActive(settings, post.network)) return { ok: false };

  // Record the view before calling the classification API.
  const stored = await changeRecord(post.network, post.day, post.id, previous => ({
    ...previous,
    firstSeenAt: previous.firstSeenAt || new Date().toISOString()
  }));
  if (stored.status === "done") return { ok: true, cached: true };

  if (post.text.trim().length < 30) {
    await changeRecord(post.network, post.day, post.id, previous => ({
      ...previous, status: previous.status === "done" ? "done" : "no-text"
    }));
    return { ok: true, classified: false };
  }

  // Queue one classification task per network, day, and post.
  const key = recordKey(post.network, post.day, post.id);
  if (!pendingClassifications.has(key)) {
    const job = apiQueue.then(() => classifyPost(post))
      .catch(async error => {
        await changeRecord(post.network, post.day, post.id, previous => ({
          ...previous,
          status: previous.status === "done" ? "done" : "error",
          error: error.message.slice(0, 100)
        }));
      })
      .finally(() => pendingClassifications.delete(key));
    pendingClassifications.add(key);
    apiQueue = job.catch(() => {});
  }
  return { ok: true, queued: true };
}

async function classifyPost(post) {
  const settings = await chrome.storage.local.get(["apiKey", "interests", "networksEnabled", "records"]);
  if (!isActive(settings, post.network)) return;

  const key = recordKey(post.network, post.day, post.id);
  if (normalizeRecords(settings.records)[key]?.status === "done") return;

  // Choice returns one primary category per post.
  const criteria = {
    irrelevant: "The post does not match any saved interest or is too generic to be useful for those interests."
  };
  settings.interests.slice(0, 20).forEach((interest, index) => {
    criteria[`interest_${index}`] = `${interest.name}: ${interest.description}`;
  });

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "jev-latest",
      state: { post: post.text },
      questions: {
        category: {
          type: "choice",
          instructions: "Choose the primary category. If none of the interests match, choose irrelevant.",
          criteria
        }
      }
    })
  });
  if (!response.ok) throw new Error(`Jev API returned HTTP ${response.status}`);

  const data = await response.json();
  const choice = data.answers?.category?.choice;
  if (typeof choice !== "string" || !Object.hasOwn(criteria, choice)) {
    throw new Error("Unexpected response from the Jev API.");
  }

  const interest = choice === "irrelevant" ? "" :
    settings.interests[Number(choice.slice("interest_".length))].name;

  await changeRecord(post.network, post.day, post.id, previous => ({
    ...previous,
    category: choice === "irrelevant" ? "irrelevant" : "relevant",
    interest,
    classifiedAt: new Date().toISOString(),
    status: "done",
    error: undefined
  }));
}

async function markOpened(network, day, id) {
  const settings = await chrome.storage.local.get(["apiKey", "interests", "networksEnabled"]);
  if (!isActive(settings, network)) return { ok: false };
  await changeRecord(network, day, id, previous => ({
    ...previous,
    opened: true,
    openedAt: previous.openedAt || new Date().toISOString(),
    firstSeenAt: previous.firstSeenAt || new Date().toISOString()
  }));
  return { ok: true };
}
