const STATUS_OPTIONS = ["未確認", "確認済み", "重要", "応募予定", "応募済み", "購入済み", "スルー"];
const STATUS_KEY = "dragonball-event-status-v3";
const OLD_STATUS_KEYS = ["dragonball-event-status-v2", "dragonball-event-status-v1"];
const CALENDAR_CATEGORY_KEY = "watch-calendar-category-v1";

let events = [];
let currentFilter = "all";
let currentCalendarCategory = localStorage.getItem(CALENDAR_CATEGORY_KEY) || "all";
let calendar = null;
let lastCalendarView = null;
let lastCalendarDate = null;

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
  renderCalendar(true);
  renderLists();
}

function getStatus(event) {
  return loadStatuses()[getEventStatusKey(event)] || "未確認";
}

function getScore(event) {
  return Number(event.score || 0);
}

function priorityRank(priority) {
  return { S: 4, A: 3, B: 2, C: 1 }[priority] || 0;
}

function eventText(event) {
  return [
    event.title,
    event.productTitle,
    event.eventType,
    event.saleType,
    event.source,
    event.memo,
    ...(event.flags || [])
  ].join(" ");
}

function detectCategory(event) {
  const text = eventText(event);
  if (/DBFW|フュージョンワールド|ドラゴンボール|ダイバーズ|アドバンスパック/i.test(text)) return "dragonball";
  if (/ポケカ|ポケモンカード|Pokemon|Pokémon/i.test(text)) return "pokemon";
  if (/ワンピカード|ワンピースカード|ONE PIECE/i.test(text)) return "onepiece";
  if (/遊戯王|遊戯王OCG|Yu-Gi-Oh/i.test(text)) return "yugioh";
  if (/ホロカ|ホロライブ|ヴァイス|ヴァイスシュヴァルツ|Weiss/i.test(text)) return "hololive";
  if (/ガンダムカード|ガンダムカードゲーム|ガンプラ|GUNDAM|プレバン/i.test(text)) return "gundam";
  if (/MTG|マジックザギャザリング|Magic: The Gathering|コレクターブースター/i.test(text)) return "mtg";
  if (/一番くじ|くじオンライン|くじ/i.test(text)) return "kuji";
  return "other";
}

function categoryLabel(value) {
  return {
    all: "全部",
    dragonball: "ドラゴンボール/DBFW",
    pokemon: "ポケカ",
    onepiece: "ワンピカード",
    yugioh: "遊戯王",
    hololive: "ホロカ/ヴァイス",
    gundam: "ガンダム/ガンプラ",
    mtg: "MTG",
    kuji: "一番くじ",
    other: "その他"
  }[value] || "全部";
}

function isCalendarCategoryMatch(event) {
  if (currentCalendarCategory === "all") return true;
  return detectCategory(event) === currentCalendarCategory;
}

function getCategoryScopedEvents() {
  return events.filter(isCalendarCategoryMatch);
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

function isFresh(event, hours = 24) {
  if (!event.detectedAt) return false;
  const detected = new Date(event.detectedAt);
  if (Number.isNaN(detected.getTime())) return false;
  return Date.now() - detected.getTime() <= hours * 60 * 60 * 1000;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripTitlePrefix(value) {
  return String(value || "").replace(/^【[^】]+】/, "").trim();
}

function shortTitle(event, maxLength = 28) {
  const raw = stripTitlePrefix(event.productTitle || event.title || "");
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, maxLength)}…`;
}

function calendarTitle(event) {
  const type = String(event.eventType || "要確認")
    .replace(/^X/, "")
    .replace("要確認", "")
    .replace("ショップ", "")
    .replace("予定", "");
  const prefix = type || "要確認";
  const priority = event.priority ? `${event.priority} ` : "";
  return `${priority}${prefix}：${shortTitle(event, 16)}`;
}

function calendarClassNames(event) {
  const status = getStatus(event);
  const classes = ["calStatusOther", `calPriority${event.priority || "C"}`, `calCat-${detectCategory(event)}`];
  if (status === "未確認" && isFresh(event, 48)) classes.push("calFreshUnconfirmed");
  else if (status === "未確認") classes.push("calUnconfirmed");
  else if (status === "重要") classes.push("calImportant");
  else if (status === "確認済み") classes.push("calChecked");
  else if (["応募予定", "応募済み", "購入済み"].includes(status)) classes.push("calActioned");
  if (String(event.source || "").startsWith("X検索") || (event.flags || []).includes("X")) classes.push("calX");
  return classes;
}

function makeCard(event) {
  const status = getStatus(event);
  const d = daysUntil(event.startAt || event.date);
  const near = event.eventType?.includes("締切") && d !== null && d >= 0 && d <= 3;
  const undated = !hasValidDate(event);
  const isX = String(event.source || "").startsWith("X検索") || (event.flags || []).includes("X");
  const priority = event.priority || "C";
  const card = document.createElement("div");
  card.className = `card priority-${priority} ${near ? "deadline" : ""} ${isX ? "xCard" : ""} ${status === "未確認" && isFresh(event, 48) ? "freshCard" : ""}`;

  const flags = (event.flags || []).map(f => `<span class="flag">${escapeHtml(f)}</span>`).join("");
  const reasons = (event.scoreReasons || []).slice(0, 4).map(r => `<span class="reason">${escapeHtml(r)}</span>`).join("");
  const category = categoryLabel(detectCategory(event));

  card.innerHTML = `
    <div class="cardTop">
      <div class="cardTitle">${escapeHtml(event.title || event.productTitle)}</div>
      <div class="badgeStack">
        <span class="priorityBadge priorityBadge-${escapeHtml(priority)}">${escapeHtml(priority)} / ${escapeHtml(getScore(event))}</span>
        <span class="statusBadge status-${escapeHtml(status)}">${escapeHtml(status)}</span>
      </div>
    </div>
    <div class="meta">
      カテゴリ：${escapeHtml(category)}<br>
      種別：${escapeHtml(event.eventType || "-")} / 販売形式：${escapeHtml(event.saleType || "-")}<br>
      判定：${escapeHtml(event.actionability || "-")}<br>
      日時：${escapeHtml(formatDateTime(event.startAt || event.date))}${undated ? "（カレンダー未掲載）" : ""}<br>
      検知元：${escapeHtml(event.source || "-")}<br>
      検知：${escapeHtml(formatDateTime(event.detectedAt))}
    </div>
    <div class="reasonRow">${reasons}</div>
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
    <p><strong>カテゴリ：</strong>${escapeHtml(categoryLabel(detectCategory(event)))}</p>
    <p><strong>優先度：</strong>${escapeHtml(event.priority || "-")} / ${escapeHtml(getScore(event))}</p>
    <p><strong>判定：</strong>${escapeHtml(event.actionability || "-")}</p>
    <p><strong>理由：</strong>${escapeHtml((event.scoreReasons || []).join(" / ") || "-")}</p>
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
    const pr = priorityRank(b.priority) - priorityRank(a.priority);
    if (pr !== 0) return pr;
    const scoreDiff = getScore(b) - getScore(a);
    if (scoreDiff !== 0) return scoreDiff;
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

function sortByPriorityThenDetected(list) {
  return [...list].sort((a, b) => {
    const pr = priorityRank(b.priority) - priorityRank(a.priority);
    if (pr !== 0) return pr;
    const scoreDiff = getScore(b) - getScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.detectedAt || 0).getTime() - new Date(a.detectedAt || 0).getTime();
  });
}

function renderLists() {
  const categoryEvents = getCategoryScopedEvents();
  const sorted = sortEvents(categoryEvents);

  const unconfirmedEvents = sortByPriorityThenDetected(categoryEvents).filter(e => {
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

  const allSorted = sortEvents(events);
  const filtered = allSorted.filter(e => {
    if (currentFilter === "all") return true;
    return getStatus(e) === currentFilter;
  });

  renderContainer("unconfirmedList", unconfirmedEvents.slice(0, 16));
  renderContainer("deadlineList", deadlineEvents.slice(0, 8));
  renderContainer("activeList", activeEvents);
  renderContainer("allList", filtered);

  const datedEvents = events.filter(hasValidDate).filter(e => getStatus(e) !== "スルー");
  const calendarShown = datedEvents.filter(isCalendarCategoryMatch).length;
  const categoryTotal = categoryEvents.length;
  const categoryUnconfirmed = categoryEvents.filter(e => getStatus(e) === "未確認").length;
  const unconfirmedCount = events.filter(e => getStatus(e) === "未確認").length;
  const sCount = categoryEvents.filter(e => e.priority === "S").length;
  const aCount = categoryEvents.filter(e => e.priority === "A").length;
  document.getElementById("summary").textContent = `表示:${categoryLabel(currentCalendarCategory)} ${calendarShown}/${datedEvents.length}件 / このカテゴリ${categoryTotal}件 / S${sCount}件 / A${aCount}件 / 未確認${categoryUnconfirmed}件（全体${unconfirmedCount}件）`;
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

function isSmallScreen() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function rememberCalendarState() {
  if (!calendar) return;
  lastCalendarView = calendar.view?.type || lastCalendarView;
  lastCalendarDate = calendar.getDate ? calendar.getDate() : lastCalendarDate;
}

function getCalendarEvents() {
  return events
    .filter(hasValidDate)
    .filter(e => getStatus(e) !== "スルー")
    .filter(isCalendarCategoryMatch)
    .map(e => ({
      id: e.id,
      title: calendarTitle(e),
      start: e.startAt || e.date,
      classNames: calendarClassNames(e),
      extendedProps: e
    }));
}

function refreshCalendarEventsOnly() {
  if (!calendar) return;
  rememberCalendarState();
  calendar.removeAllEvents();
  calendar.addEventSource(getCalendarEvents());
}

function renderCalendar(preserveState = false) {
  const calendarEl = document.getElementById("calendar");
  if (calendar && preserveState) {
    refreshCalendarEventsOnly();
    return;
  }

  if (calendar) {
    rememberCalendarState();
    calendar.destroy();
  }

  const initialView = lastCalendarView || (isSmallScreen() ? "listWeek" : "dayGridMonth");
  const initialDate = lastCalendarDate || undefined;

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView,
    initialDate,
    headerToolbar: isSmallScreen()
      ? { left: "prev,next", center: "title", right: "listWeek,dayGridMonth" }
      : { left: "prev,next today", center: "title", right: "dayGridMonth,listWeek" },
    locale: "ja",
    height: "auto",
    contentHeight: "auto",
    eventDisplay: "block",
    eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
    events: getCalendarEvents(),
    datesSet(info) {
      lastCalendarView = info.view.type;
      lastCalendarDate = calendar ? calendar.getDate() : null;
    },
    eventClick(info) {
      showDetail(info.event.extendedProps);
    }
  });
  calendar.render();
}

async function loadEvents() {
  const res = await fetch(`./public/events.json?ts=${Date.now()}`);
  events = await res.json();
  const select = document.getElementById("calendarCategorySelect");
  if (select) select.value = currentCalendarCategory;
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

const calendarCategorySelect = document.getElementById("calendarCategorySelect");
if (calendarCategorySelect) {
  calendarCategorySelect.value = currentCalendarCategory;
  calendarCategorySelect.addEventListener("change", (e) => {
    currentCalendarCategory = e.target.value;
    localStorage.setItem(CALENDAR_CATEGORY_KEY, currentCalendarCategory);
    renderCalendar(true);
    renderLists();
  });
}

loadEvents().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML("beforeend", `<p style="padding: 20px;">events.json の読み込みに失敗しました。</p>`);
});
