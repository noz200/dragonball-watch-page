const STATUS_OPTIONS = ["未確認", "確認済み", "重要", "応募予定", "応募済み", "購入済み", "スルー"];
const STATUS_KEY = "dragonball-event-status-v3";
const OLD_STATUS_KEYS = ["dragonball-event-status-v2", "dragonball-event-status-v1"];

let events = [];
let currentFilter = "all";
let calendar = null;

function loadStatuses() {
  try {
    const current = JSON.parse(localStorage.getItem(STATUS_KEY)) || {};
    for (const oldKey of OLD_STATUS_KEYS) {
      const old = JSON.parse(localStorage.getItem(oldKey)) || {};
      for (const [key, value] of Object.entries(old)) {
        if (current[key] === undefined) current[key] = value;
      }
    }
    localStorage.setItem(STATUS_KEY, JSON.stringify(current));
    return current;
  } catch {
    return {};
  }
}

function normalizeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value).split("?")[0].split("#")[0].replace(/\/$/, "");
  }
}

function getEventStatusKey(event) {
  if (event.statusKey) return event.statusKey;
  if (event.eventKey) return event.eventKey;
  if (event.url) return `url:${normalizeUrl(event.url)}`;
  if (event.productId) return `product:${event.productId}`;
  return `id:${event.id}`;
}

function saveStatus(event, status) {
  const statuses = loadStatuses();
  statuses[getEventStatusKey(event)] = status;
  localStorage.setItem(STATUS_KEY, JSON.stringify(statuses));
  renderLists();
}

function getStatus(event) {
  return loadStatuses()[getEventStatusKey(event)] || "未確認";
}

function hasValidDate(event) {
  const value = event.startAt || event.date;
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function formatDateTime(value) {
  if (!value) return "日付未取得";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日付未取得";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function daysUntil(value) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const diff = target.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function isFutureOrUndated(event) {
  if (!hasValidDate(event)) return true;
  const d = new Date(event.startAt || event.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= today;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeCard(event) {
  const status = getStatus(event);
  const d = daysUntil(event.startAt || event.date);
  const near = event.eventType?.includes("締切") && d !== null && d >= 0 && d <= 3;
  const undated = !hasValidDate(event);
  const isX = String(event.source || "").startsWith("X検索") || (event.flags || []).includes("X");
  const card = document.createElement("div");
  card.className = `card ${near ? "deadline" : ""} ${isX ? "xCard" : ""}`;

  const flags = (event.flags || []).map(f => `<span class="flag">${escapeHtml(f)}</span>`).join("");

  card.innerHTML = `
    <div class="cardTop">
      <div class="cardTitle">${escapeHtml(event.title || event.productTitle)}</div>
      <span class="statusBadge status-${escapeHtml(status)}">${escapeHtml(status)}</span>
    </div>
    <div class="meta">
      種別：${escapeHtml(event.eventType || "-")} / 販売形式：${escapeHtml(event.saleType || "-")}<br>
      日時：${escapeHtml(formatDateTime(event.startAt || event.date))}${undated ? "（カレンダー未掲載）" : ""}<br>
      検知元：${escapeHtml(event.source || "-")}<br>
      検知：${escapeHtml(formatDateTime(event.detectedAt))}
    </div>
    <div class="flags">${flags}</div>
    <div class="actions">
      ${event.url ? `<a href="${escapeHtml(event.url)}" target="_blank" rel="noopener">公式/販売ページ</a>` : ""}
      ${event.xSearchUrl ? `<a href="${escapeHtml(event.xSearchUrl)}" target="_blank" rel="noopener">X検索</a>` : ""}
      <a href="#" class="detailLink">詳細</a>
    </div>
    <div class="statusRow">
      <select class="statusSelect">
        ${STATUS_OPTIONS.map(opt => `<option value="${opt}" ${opt === status ? "selected" : ""}>${opt}</option>`).join("")}
      </select>
    </div>
  `;

  card.querySelector(".statusSelect").addEventListener("change", (e) => {
    saveStatus(event, e.target.value);
  });

  card.querySelector(".detailLink").addEventListener("click", (e) => {
    e.preventDefault();
    showDetail(event);
  });

  return card;
}

function showDetail(event) {
  const dialog = document.getElementById("detailDialog");
  const content = document.getElementById("detailContent");
  content.innerHTML = `
    <h2>${escapeHtml(event.productTitle || event.title)}</h2>
    <p><strong>ステータスキー：</strong>${escapeHtml(getEventStatusKey(event))}</p>
    <p><strong>イベント：</strong>${escapeHtml(event.eventType || "-")}</p>
    <p><strong>販売形式：</strong>${escapeHtml(event.saleType || "-")}</p>
    <p><strong>日時：</strong>${escapeHtml(formatDateTime(event.startAt || event.date))}</p>
    <p><strong>検知元：</strong>${escapeHtml(event.source || "-")}</p>
    <p><strong>検知日時：</strong>${escapeHtml(formatDateTime(event.detectedAt))}</p>
    <p><strong>フラグ：</strong>${escapeHtml((event.flags || []).join(" / ") || "-")}</p>
    <p><strong>メモ：</strong>${escapeHtml(event.memo || "-")}</p>
    <div class="actions">
      ${event.url ? `<a href="${escapeHtml(event.url)}" target="_blank" rel="noopener">公式/販売ページ</a>` : ""}
      ${event.xSearchUrl ? `<a href="${escapeHtml(event.xSearchUrl)}" target="_blank" rel="noopener">X検索</a>` : ""}
    </div>
  `;
  dialog.showModal();
}

function sortEvents(list) {
  return [...list].sort((a, b) => {
    const aValid = hasValidDate(a);
    const bValid = hasValidDate(b);
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;
    const da = new Date(a.startAt || a.date).getTime() || 0;
    const db = new Date(b.startAt || b.date).getTime() || 0;
    if (da !== db) return da - db;
    return new Date(b.detectedAt || 0).getTime() - new Date(a.detectedAt || 0).getTime();
  });
}

function sortByDetectedDesc(list) {
  return [...list].sort((a, b) => new Date(b.detectedAt || 0).getTime() - new Date(a.detectedAt || 0).getTime());
}

function renderLists() {
  const sorted = sortEvents(events);

  const unconfirmedEvents = sortByDetectedDesc(events).filter(e => {
    return getStatus(e) === "未確認" && isFutureOrUndated(e);
  });

  const deadlineEvents = sorted.filter(e => {
    const d = daysUntil(e.startAt || e.date);
    return e.eventType?.includes("締切") && d !== null && d >= 0 && d <= 7 && getStatus(e) !== "スルー";
  });

  const activeEvents = sorted.filter(e => {
    const status = getStatus(e);
    return status !== "スルー" && status !== "確認済み" && isFutureOrUndated(e);
  }).slice(0, 12);

  const filtered = sorted.filter(e => {
    if (currentFilter === "all") return true;
    return getStatus(e) === currentFilter;
  });

  renderContainer("unconfirmedList", unconfirmedEvents.slice(0, 16));
  renderContainer("deadlineList", deadlineEvents.slice(0, 8));
  renderContainer("activeList", activeEvents);
  renderContainer("allList", filtered);

  const datedCount = events.filter(hasValidDate).length;
  const undatedCount = events.length - datedCount;
  const unconfirmedCount = events.filter(e => getStatus(e) === "未確認").length;
  document.getElementById("summary").textContent = `全${events.length}件 / 未確認${unconfirmedCount}件 / カレンダー${datedCount}件 / 日付未取得${undatedCount}件`;
}

function renderContainer(id, list) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = "";
  if (!list.length) {
    el.innerHTML = `<div class="meta">該当なし。平和です。今だけ。</div>`;
    return;
  }
  list.forEach(event => el.appendChild(makeCard(event)));
}

function renderCalendar() {
  const calendarEl = document.getElementById("calendar");
  if (calendar) calendar.destroy();

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    locale: "ja",
    height: "auto",
    events: events.filter(hasValidDate).filter(e => getStatus(e) !== "スルー").map(e => ({
      id: e.id,
      title: e.title,
      start: e.startAt || e.date,
      extendedProps: e
    })),
    eventClick(info) {
      showDetail(info.event.extendedProps);
    }
  });
  calendar.render();
}

async function loadEvents() {
  const res = await fetch(`./public/events.json?ts=${Date.now()}`);
  events = await res.json();
  renderCalendar();
  renderLists();
}

document.getElementById("reloadButton").addEventListener("click", () => {
  location.reload();
});

document.getElementById("closeDialog").addEventListener("click", () => {
  document.getElementById("detailDialog").close();
});

document.querySelectorAll(".filter").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    currentFilter = button.dataset.filter;
    renderLists();
  });
});

loadEvents().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML("beforeend", `<p style="padding: 20px;">events.json の読み込みに失敗しました。</p>`);
});
