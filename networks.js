// FeedLens - supported network registry.
// Add new networks here and register their adapters in manifest.json.
// Shared by the panel, content scripts, and service worker.
// AI disclosure: This code was developed with help from ChatGPT for CS50.

const FeedLensNetworks = Object.freeze({
  linkedin: {
    name: "LinkedIn",
    hosts: ["www.linkedin.com", "linkedin.com"]
  }
});

// Identify the network from the sender's URL.
function networkForUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return Object.keys(FeedLensNetworks).find(id =>
      FeedLensNetworks[id].hosts.includes(parsed.hostname)
    ) || null;
  } catch {
    return null;
  }
}

// A post can appear on multiple networks or days.
function recordKey(network, day, id) {
  return `${network}|${day}|${id}`;
}
