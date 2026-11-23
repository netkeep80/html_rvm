import { MemoryDocumentProvider } from "../src/memory-document-provider.js";
import { createWorkingSession } from "../src/working-session.js";
import { setWorking, removeWorking, incrementWorking, stressWorking, describeDifference } from "./operations.js";

const $ = id => document.getElementById(id);
const pretty = value => JSON.stringify(value, null, 2);
const nf = new Intl.NumberFormat("ru-RU");
const samples = Object.freeze({
  counter: {
    counter: 0, message: "Рабочая копия независима от снимка",
    meta: { version: 1 }, events: []
  },
  cash: {
    balance: 1000, currency: "RUB",
    transactions: [
      { id: "test-001", type: "income", amount: 500, note: "Обезличенный пример" }
    ],
    meta: { version: 1, status: "demo" }
  }
});
let provider = null;
let snapshot = null;
let session = null;
let original = null;
let mutations = 0;
let busy = false;

function status(message, kind = "") {
  const line = $("status-line");
  line.className = "status-line" + (kind ? " " + kind : "");
  line.textContent = message;
}
function log(message) {
  const li = document.createElement("li");
  const time = document.createElement("time");
  time.dateTime = new Date().toISOString();
  time.textContent = new Date().toLocaleTimeString("ru-RU");
  const text = document.createElement("span");
  text.textContent = message;
  li.append(time, text);
  $("event-log").prepend(li);
  while ($("event-log").children.length > 30) $("event-log").lastElementChild.remove();
}
function reportError(error) {
  const code = error?.code ? error.code + ": " : "";
  const message = typeof error?.message === "string" ? error.message : "Неизвестная ошибка";
  status(code + message, "error");
  log("Ошибка — " + code + message);
}
function ensureReady() {
  if (!session || !provider || !snapshot) throw Error("Сначала создай снимок");
}
function syncView() {
  ensureReady();
  const working = session.exportDocument("model");
  $("working-editor").value = pretty(working);
  $("working-size").textContent = nf.format($("working-editor").value.length) + " символов";
  $("source-size").textContent = nf.format($("source-editor").value.length) + " символов";
  $("stat-mutations").textContent = nf.format(mutations);
  const changed = describeDifference(original, working) === "changed";
  const diff = $("diff-status");
  diff.textContent = changed ? "● Есть отличия от снимка" : "● Совпадает с источником";
  diff.classList.toggle("changed", changed);
}
async function createSnapshot() {
  // Transactional UI update: errors leave the old valid session intact.
  const input = JSON.parse($("source-editor").value);
  const nextProvider = new MemoryDocumentProvider({ model: input });
  const nextSnapshot = await nextProvider.openSnapshot();
  const nextOriginal = await nextProvider.read(nextSnapshot, "model");
  const nextSession = await createWorkingSession(nextProvider, nextSnapshot, ["model"]);
  provider = nextProvider; snapshot = nextSnapshot;
  original = nextOriginal; session = nextSession; mutations = 0;
  $("stat-duration").textContent = "—";
  $("stat-source").textContent = "Не изменён";
  $("stat-source").classList.add("stat-green");
  $("verify-result").textContent = "Проверка ещё не выполнялась";
  $("verify-result").className = "verify-result";
  syncView();
  status("Снимок создан. Рабочая модель отделена от исходного JSON.", "success");
  log("Создан новый snapshot и независимый WorkingSession");
}
function withAction(name, action) {
  try {
    ensureReady();
    const result = action();
    mutations++;
    syncView();
    status(name + (result === undefined ? "" : ": " + String(result)), "success");
    log(name + " — операция в RAM; запись в DBMS отсутствует");
  } catch (error) { reportError(error); }
}
function chooseSample(key) {
  if (!Object.hasOwn(samples, key)) return;
  $("source-editor").value = pretty(samples[key]);
  $("source-size").textContent = nf.format($("source-editor").value.length) + " символов";
  for (const button of document.querySelectorAll("[data-preset]")) {
    button.classList.toggle("active", button.dataset.preset === key);
  }
  $("pointer-path").value = key === "cash" ? "/balance" : "/counter";
  status("Пример выбран. Нажми «Создать снимок», чтобы загрузить его в память.");
}
function bindClick(id, fn) { $(id).addEventListener("click", fn); }
function lockControls(locked) {
  busy = locked;
  for (const id of ["create-snapshot","apply-working","reset-working","increment","stress","set-value","delete-value","verify","export-working"]) {
    $(id).disabled = locked;
  }
}
function downloadJSON() {
  try {
    ensureReady();
    const content = pretty(session.exportDocument("model")) + "\n";
    const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "html-rvm-working.json"; a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("Создан файл рабочего JSON по явному запросу. HTML DBMS не затронут.", "success");
    log("Экспорт рабочего JSON в файл по нажатию пользователя");
  } catch (error) { reportError(error); }
}
async function checkIsolation() {
  try {
    ensureReady();
    const pinned = await provider.read(snapshot, "model");
    const intact = describeDifference(pinned, original) === "identical";
    const changed = describeDifference(pinned, session.exportDocument("model")) === "changed";
    $("stat-source").textContent = intact ? "Не изменён" : "Нарушена изоляция";
    $("stat-source").classList.toggle("stat-green", intact);
    $("verify-result").className = "verify-result " + (intact ? "pass" : "fail");
    $("verify-result").textContent = intact
      ? "PASS · исходный JSON неизменен; рабочий " + (changed ? "отличается" : "совпадает")
      : "FAIL · исходный snapshot отличается от эталона";
    status(intact ? "Изоляция подтверждена: изменения остались только в RAM." : "Нарушена изоляция snapshot!", intact ? "success" : "error");
    log("Проверка изоляции: " + (intact ? "PASS" : "FAIL"));
  } catch (error) { reportError(error); }
}
async function stress() {
  if (busy) return;
  lockControls(true);
  status("Выполняется 1 000 000 прямых операций над рабочим JSON…");
  await new Promise(resolve => requestAnimationFrame(resolve));
  try {
    ensureReady();
    const result = stressWorking(session, "model", $("pointer-path").value, 1_000_000);
    mutations += result.count;
    $("stat-duration").textContent = result.durationMs.toFixed(2) + " мс";
    syncView();
    status("Выполнено " + nf.format(result.count) + " изменений за " + result.durationMs.toFixed(2) + " мс. Записей DBMS: 0.", "success");
    log("Stress: " + nf.format(result.count) + " RAM-инкрементов за " + result.durationMs.toFixed(2) + " мс");
  } catch (error) { reportError(error); }
  finally { lockControls(false); }
}
async function setBuildInfo() {
  try {
    const response = await fetch("./build-info.json", { cache: "no-store" });
    if (!response.ok) return;
    const info = await response.json();
    if (typeof info.commit === "string" && /^[0-9a-f]{40}$/.test(info.commit)) {
      $("build-version").textContent = "HEAD " + info.commit.slice(0, 12);
    }
  } catch { /* local server without build metadata */ }
}
bindClick("create-snapshot", async () => { try { await createSnapshot(); } catch (error) { reportError(error); } });
bindClick("reset-working", async () => {
  try {
    ensureReady();
    session = await createWorkingSession(provider, snapshot, ["model"]);
    mutations = 0;
    $("stat-duration").textContent = "—";
    syncView();
    status("Рабочий JSON сброшен к исходному снимку. Сам snapshot не изменён.", "success");
    log("Рабочая сессия пересоздана из pinned snapshot");
  } catch (error) { reportError(error); }
});
bindClick("apply-working", () => withAction("Ручная замена рабочего JSON", () => {
  session.replaceDocument("model", JSON.parse($("working-editor").value));
}));
bindClick("increment", () => withAction("Инкремент", () => {
  const raw = $("increment-amount").value.trim();
  if (raw === "") throw Error("Приращение не может быть пустым");
  return incrementWorking(session, "model", $("pointer-path").value, Number(raw));
}));
bindClick("set-value", () => withAction("Установка значения", () => {
  setWorking(session, "model", $("pointer-path").value, JSON.parse($("new-value").value));
  return $("pointer-path").value || "(корень)";
}));
bindClick("delete-value", () => withAction("Удаление значения", () => {
  removeWorking(session, "model", $("pointer-path").value);
  return $("pointer-path").value;
}));
bindClick("stress", stress);
bindClick("verify", checkIsolation);
bindClick("export-working", downloadJSON);
bindClick("clear-log", () => {
  $("event-log").replaceChildren();
  status("Журнал очищен. Данные и счётчик изменений не затронуты.");
});
for (const button of document.querySelectorAll("[data-preset]")) {
  button.addEventListener("click", () => chooseSample(button.dataset.preset));
}
$("source-file").addEventListener("change", async event => {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw Error("Лимит импорта JSON: 2 МБ");
    const content = await file.text();
    JSON.parse(content);
    $("source-editor").value = content;
    $("source-size").textContent = nf.format(content.length) + " символов";
    status("Файл помещён в редактор. Нажми «Создать снимок» для загрузки.");
    log("Локальный импорт файла " + file.name + " (без отправки в сеть)");
  } catch (error) { reportError(error); }
  finally { event.currentTarget.value = ""; }
});
$("source-editor").addEventListener("input", () => {
  $("source-size").textContent = nf.format($("source-editor").value.length) + " символов";
});
$("working-editor").addEventListener("input", () => {
  $("working-size").textContent = nf.format($("working-editor").value.length) + " символов";
});
try {
  await createSnapshot();
  await setBuildInfo();
} catch (error) { reportError(error); }
