// FeedLens - daily activity, monthly history, and settings.
// The panel reads from a shared store across networks.
// AI disclosure: ChatGPT helped revise the interface and logic for CS50.

const $ = id => document.getElementById(id);
let interests = [];
let records = {};
let selectedNetwork = "linkedin";
let networksEnabled = {};

function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function networkName() {
  return selectedNetwork === "all" ? "All networks" : FeedLensNetworks[selectedNetwork].name;
}

function filteredPosts(period) {
  return Object.values(records).filter(post =>
    (selectedNetwork === "all" || (post.network || "linkedin") === selectedNetwork) &&
    (!period || post.day?.startsWith(period))
  );
}

function countPosts(posts) {
  return {
    total: posts.length,
    opened: posts.filter(post => post.opened).length
  };
}

function countClassified(posts) {
  const result = {
    relevant: { total: 0, opened: 0 },
    irrelevant: { total: 0, opened: 0 }
  };
  for (const post of posts) {
    if (post.status !== "done" || !result[post.category]) continue;
    result[post.category].total++;
    if (post.opened) result[post.category].opened++;
  }
  return result;
}

function percent(opened, total) {
  return total ? Math.round(opened / total * 100) : 0;
}

// Render counts with text and DOM elements to avoid injecting third-party HTML.
function setPair(id, count) {
  const element = $(id);
  const opened = document.createElement("span");
  opened.textContent = count.opened;
  const slash = document.createElement("span");
  slash.className = "slash";
  slash.textContent = "/";
  const total = document.createElement("span");
  total.className = "secondary-num";
  total.textContent = count.total;
  element.replaceChildren(opened, slash, total);
}

// The light bar shows the total, and the dark segment shows expanded posts.
function makeBar(total, opened, maximum, color) {
  const track = document.createElement("div");
  track.className = "track";
  const light = document.createElement("div");
  light.className = `totalbar ${color}-light`;
  light.style.width = `${maximum ? Math.min(100, total / maximum * 100) : 0}%`;
  const dark = document.createElement("div");
  dark.className = `openedbar ${color}-dark`;
  dark.style.width = `${percent(opened, total)}%`;
  light.append(dark);
  track.append(light);
  return track;
}

function countInterests(posts) {
  const counts = new Map(interests.map(item => [item.name, { total: 0, opened: 0 }]));
  for (const post of posts) {
    if (post.status !== "done" || post.category !== "relevant") continue;
    if (!counts.has(post.interest)) counts.set(post.interest, { total: 0, opened: 0 });
    const current = counts.get(post.interest);
    current.total++;
    if (post.opened) current.opened++;
  }
  return counts;
}

function renderInterests(id, posts) {
  const container = $(id);
  container.replaceChildren();
  const counts = countInterests(posts);
  const maximum = Math.max(1, ...Array.from(counts.values(), count => count.total));

  const entries = [...counts].sort(([, a], [, b]) => b.total - a.total);

  for (const [name, count] of entries) {
    const item = document.createElement("div");
    item.className = "interest-item";
    const line = document.createElement("div");
    line.className = "line";
    const title = document.createElement("span");
    title.textContent = name;
    const number = document.createElement("strong");
    number.textContent = `${count.opened} / ${count.total}`;
    line.append(title, number);
    item.append(line, makeBar(count.total, count.opened, maximum, "green"));
    container.append(item);
  }
  if (!counts.size) {
    const empty = document.createElement("p");
    empty.className = "muted small";
    empty.textContent = "Add your first interest in Settings.";
    container.append(empty);
  }
}

function renderToday() {
  const today = localDay();
  $("todayTitle").textContent = `Today · ${new Intl.DateTimeFormat("en-US").format(new Date(`${today}T00:00:00`))}`;
  const posts = filteredPosts(today);
  const all = countPosts(posts);
  const classified = countClassified(posts);
  setPair("todayAll", all);
  $("todayAllRate").textContent = `${percent(all.opened, all.total)}% of posts expanded`;
  setPair("todayRelevant", classified.relevant);
  setPair("todayIrrelevant", classified.irrelevant);
  $("todayGreen").replaceChildren(makeBar(classified.relevant.total, classified.relevant.opened, classified.relevant.total, "green"));
  $("todayRed").replaceChildren(makeBar(classified.irrelevant.total, classified.irrelevant.opened, classified.irrelevant.total, "red"));
  renderInterests("todayInterests", posts);
}

function renderMonth() {
  const posts = filteredPosts($("monthPicker").value);
  const all = countPosts(posts);
  const classified = countClassified(posts);
  setPair("monthAll", all);
  $("monthAllRate").textContent = `${percent(all.opened, all.total)}% of posts expanded this month`;
  setPair("monthRelevant", classified.relevant);
  setPair("monthIrrelevant", classified.irrelevant);
  renderInterests("monthInterests", posts);

  // Group posts by day and draw green and red bars.
  const byDay = new Map();
  for (const post of posts) {
    if (!byDay.has(post.day)) byDay.set(post.day, []);
    byDay.get(post.day).push(post);
  }
  const maximum = Math.max(1, ...Array.from(byDay.values(), day => {
    const count = countClassified(day);
    return Math.max(count.relevant.total, count.irrelevant.total);
  }));
  const container = $("days");
  container.replaceChildren();
  for (const [date, dayPosts] of [...byDay].sort((a, b) => b[0].localeCompare(a[0]))) {
    const counts = countClassified(dayPosts);
    const row = document.createElement("div");
    row.className = "day daygrid";
    const dateLabel = document.createElement("span");
    dateLabel.className = "day-date";
    dateLabel.textContent = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00`));
    row.append(dateLabel);
    for (const [category, color, label] of [["relevant", "green", "In Focus"], ["irrelevant", "red", "Off Topic"]]) {
      const count = counts[category];
      const column = document.createElement("div");
      const caption = document.createElement("div");
      caption.className = "day-caption";
      const labelText = document.createElement("span");
      labelText.textContent = label;
      const number = document.createElement("strong");
      number.textContent = `${count.opened}/${count.total}`;
      caption.append(labelText, number);
      column.append(caption, makeBar(count.total, count.opened, maximum, color));
      row.append(column);
    }
    container.append(row);
  }
  if (!byDay.size) {
    const empty = document.createElement("p");
    empty.className = "muted small";
    empty.style.padding = "12px 0";
    empty.textContent = "No posts viewed this month.";
    container.append(empty);
  }
}

function showMessage(text, error = false) {
  $("message").textContent = text;
  $("message").className = error ? "error" : "";
}

function renderSavedInterests() {
  $("interestCount").textContent = `${interests.length} ${interests.length === 1 ? "interest" : "interests"}`;
  const container = $("settingsInterests");
  container.replaceChildren();
  interests.forEach((interest, index) => {
    const item = document.createElement("div");
    item.className = "saved-interest";
    const head = document.createElement("div");
    head.className = "interest-head";
    const title = document.createElement("strong");
    title.textContent = interest.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button-small button-danger";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      interests.splice(index, 1);
      await chrome.storage.local.set({ interests });
      await refresh();
      showMessage("Interest removed.");
    });
    head.append(title, remove);
    const description = document.createElement("p");
    description.textContent = interest.description;
    item.append(head, description);
    container.append(item);
  });
}

function renderAll() {
  renderToday();
  renderMonth();
  renderSavedInterests();
}

function showPage(page) {
  $("networkFilter").closest(".select-row").classList.toggle("hidden", page === "settings");
  document.querySelectorAll(".nav button").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  document.querySelectorAll("main section").forEach(section => {
    section.classList.toggle("hidden", section.id !== page);
  });
  showMessage("");
}

// The status explains why monitoring is paused or needs setup.
// These checks match the service worker's activation rules.
function monitorStatus(settings) {
  if (!settings.apiKey) return { state: "missing", label: "Set Up", title: "Jev API key required", detail: "Enter your Jev API key in Settings." };
  if (!interests.length) return { state: "missing", label: "Set Up", title: "No interests added", detail: "Add at least one interest to start classifying posts." };
  const anyEnabled = Object.keys(FeedLensNetworks).some(id => networksEnabled[id] !== false);
  if (!anyEnabled || (selectedNetwork !== "all" && networksEnabled[selectedNetwork] === false)) {
    return { state: "paused", label: "Paused", title: "Network disabled", detail: `Enable ${networkName()} under Monitored Networks and save your settings.` };
  }
  return { state: "active", label: "Active", title: "Monitoring active", detail: "" };
}

async function refresh() {
  const settings = await chrome.storage.local.get([
    "records", "interests", "apiKey", "networksEnabled", "selectedNetwork"
  ]);
  records = settings.records || {};
  interests = settings.interests || [];
  networksEnabled = settings.networksEnabled || {};
  selectedNetwork = settings.selectedNetwork === "all" || FeedLensNetworks[settings.selectedNetwork]
    ? settings.selectedNetwork : "linkedin";
  $("networkFilter").value = selectedNetwork;
  $("headerSubtitle").textContent = `${networkName()} · Feed activity`;
  $("keyState").textContent = settings.apiKey ? "✓ API key saved" : "No API key saved";
  const status = monitorStatus(settings);
  $("status").textContent = `● ${status.label}`;
  $("status").dataset.state = status.state;
  $("status").title = status.detail || status.title;
  $("setupNotice").classList.toggle("hidden", status.state === "active");
  $("setupTitle").textContent = status.title;
  $("setupDescription").textContent = status.detail;
  renderAll();
}

function initializeNetworkOptions() {
  const filter = $("networkFilter");
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "All networks";
  filter.append(all);
  for (const [id, network] of Object.entries(FeedLensNetworks)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = network.name;
    filter.append(option);
  }
  filter.addEventListener("change", async () => {
    selectedNetwork = filter.value;
    await chrome.storage.local.set({ selectedNetwork });
    await refresh();
  });
}

function renderNetworkSwitches() {
  const container = $("networkSettings");
  container.replaceChildren();
  for (const [id, network] of Object.entries(FeedLensNetworks)) {
    const row = document.createElement("div");
    row.className = "network-row";
    const control = document.createElement("div");
    control.className = "check-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `network_${id}`;
    checkbox.dataset.network = id;
    checkbox.checked = networksEnabled[id] !== false;
    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.textContent = network.name;
    control.append(checkbox, label);
    row.append(control);
    container.append(row);
  }
}

$("goSettings").addEventListener("click", () => showPage("settings"));
$("status").addEventListener("click", () => showPage("settings"));
document.querySelectorAll(".nav button").forEach(button => button.addEventListener("click", () => showPage(button.dataset.page)));
$("toggleKey").addEventListener("click", () => {
  const input = $("apiKey");
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  $("toggleKey").textContent = visible ? "Show" : "Hide";
});

$("saveSettings").addEventListener("click", async () => {
  const key = $("apiKey").value.trim();
  const settings = {
    networksEnabled: Object.fromEntries(
      Array.from(document.querySelectorAll("#networkSettings input"), input => [input.dataset.network, input.checked])
    )
  };
  settings.apiKey = key;
  await chrome.storage.local.set(settings);
  $("apiKey").value = key;
  $("apiKey").type = "password";
  $("toggleKey").textContent = "Show";
  await refresh();
  showMessage("Settings saved.");
});

$("addInterest").addEventListener("click", async () => {
  const name = $("interestName").value.trim();
  const description = $("interestDescription").value.trim();
  if (!name || !description) return showMessage("Enter a name and description for this interest.", true);
  if (interests.length >= 20) return showMessage("You can add up to 20 interests.", true);
  if (interests.some(item => item.name.toLowerCase() === name.toLowerCase())) {
    return showMessage("An interest with that name already exists.", true);
  }
  await chrome.storage.local.set({ interests: [...interests, { name, description }] });
  $("interestName").value = "";
  $("interestDescription").value = "";
  await refresh();
  showMessage("Interest added.");
});

$("clearData").addEventListener("click", async () => {
  if (!confirm("Delete all FeedLens data, including your history, interests, and API key?")) return;
  await chrome.storage.local.clear();
  await chrome.storage.local.set({ captureGeneration: crypto.randomUUID() });
  $("apiKey").value = "";
  $("apiKey").type = "password";
  $("toggleKey").textContent = "Show";
  $("interestName").value = "";
  $("interestDescription").value = "";
  await refresh();
  renderNetworkSwitches();
  showMessage("All data deleted.");
});

$("monthPicker").value = localDay().slice(0, 7);
$("monthPicker").addEventListener("change", renderMonth);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ["records", "interests", "apiKey", "networksEnabled", "selectedNetwork"].some(key => changes[key])) {
    refresh();
  }
});

async function initialize() {
  initializeNetworkOptions();
  const settings = await chrome.storage.local.get(["apiKey", "networksEnabled"]);
  $("apiKey").value = settings.apiKey || "";
  networksEnabled = settings.networksEnabled || {};
  renderNetworkSwitches();
  await refresh();
}
initialize().catch(error => showMessage(`Couldn't open the FeedLens panel: ${error.message}`, true));
