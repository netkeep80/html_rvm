import { MemoryDocumentProvider } from "../src/memory-document-provider.js";
import { createWorkingSession } from "../src/working-session.js";
import {
  getPointer, setWorking, removeWorking, incrementWorking,
  stressWorking, describeDifference
} from "./operations.js";

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
let snapshotNumber = 0;
let sourceSnapshotText = "";
let appliedWorkingText = "";
let sourceDirty = false;
let workingDirty = false;
let sourceInvalid = "";
let workingInvalid = "";
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
function reportError(error, preserved = "Активный snapshot и рабочая модель не изменены.") {
  const code = error?.code ? error.code + ": " : "";
  const message = typeof error?.message === "string" ? error.message : "Неизвестная ошибка";
  status(code + message + " " + preserved, "error");
  log("Ошибка — " + code + message + " " + preserved);
}
function ensureReady() {
  if (!session || !provider || !snapshot) throw Error("Сначала создай снимок");
}
function formatValue(result) {
  if (!result.exists) return "(отсутствует)";
  const serialized = JSON.stringify(result.value);
  if (serialized === undefined) return "(не является JSON)";
  return serialized.length > 190 ? serialized.slice(0, 187) + "…" : serialized;
}
function valueAt(root, pointer) {
  try {
    return { exists: true, value: getPointer(root, pointer) };
  } catch (error) {
    if (error?.code === "PATH_NOT_FOUND") return { exists: false };
    throw error;
  }
}
function recordChange(name, pointer, before, after) {
  const fromSnapshot = valueAt(original, pointer);
  $("change-operation").textContent = name;
  $("change-path").textContent = pointer === "" ? "(корень)" : pointer;
  $("change-before").textContent = formatValue(before);
  $("change-after").textContent = formatValue(after);
  $("change-snapshot").textContent = formatValue(fromSnapshot);
  $("quick-result").textContent =
    (pointer || "(корень)") + ": " + formatValue(before) + " → " +
    formatValue(after) + " · snapshot: " + formatValue(fromSnapshot) +
    " · DBMS writes: 0";
}
function clearChange() {
  $("change-operation").textContent = "Пока нет изменений";
  $("change-path").textContent = "—";
  $("change-before").textContent = "—";
  $("change-after").textContent = "—";
  $("change-snapshot").textContent = "—";
  $("quick-result").textContent = "Было 0 → нажми «+1» → станет 1 · снимок: 0 · DBMS: 0";
}
function syntaxError(text) {
  try { JSON.parse(text); return ""; }
  catch (error) { return error.message; }
}
function refreshControls() {
  sourceDirty = sourceSnapshotText !== $("source-editor").value;
  workingDirty = appliedWorkingText !== $("working-editor").value;
  sourceInvalid = syntaxError($("source-editor").value);
  workingInvalid = syntaxError($("working-editor").value);
  const sourceState = $("source-state");
  sourceState.className = "draft-state" +
    (sourceInvalid ? " invalid" : sourceDirty ? " dirty" : "");
  sourceState.textContent = sourceInvalid
    ? "INVALID · Ошибка входного JSON. Активный snapshot не изменён."
    : sourceDirty
      ? "DIRTY · Черновик изменён. Активный snapshot НЕ обновлён."
      : "APPLIED · Входной JSON соответствует активному snapshot";
  const workingState = $("working-state");
  workingState.className = "draft-state" +
    (workingInvalid ? " invalid" : workingDirty ? " dirty" : "");
  workingState.textContent = workingInvalid
    ? "INVALID · Ошибка JSON в черновике. WorkingSession не изменён."
    : workingDirty
      ? "DIRTY · Черновик не применён. Экспорт и операции недоступны до Применить / Отменить."
      : "APPLIED · Редактор соответствует активному WorkingSession";
  $("snapshot-info").textContent = snapshotNumber
    ? "Активный snapshot #" + snapshotNumber + " · только чтение · обновляется только кнопкой «Создать snapshot»"
    : "Активный snapshot ещё не создан";

  const locked = busy || !session;
  const workBlocked = locked || workingDirty;
  $("create-snapshot").disabled = busy || !!sourceInvalid || workingDirty;
  $("apply-working").disabled = locked || !workingDirty || !!workingInvalid;
  $("discard-working").disabled = locked || !workingDirty;
  for (const id of [
    "reset-working", "increment", "stress", "set-value", "delete-value",
    "verify", "export-working"
  ]) $(id).disabled = workBlocked;
  const quickPossible = session && original !== null &&
    typeof original === "object" && !Array.isArray(original) &&
    Object.hasOwn(original, "counter") &&
    typeof original.counter === "number";
  $("try-plus-one").disabled = workBlocked || sourceDirty || !quickPossible;
}
function syncView() {
  ensureReady();
  if (workingDirty) throw Error("Неприменённый черновик нельзя перезаписывать");
  const working = session.exportDocument("model");
  appliedWorkingText = pretty(working);
  $("working-editor").value = appliedWorkingText;
  $("working-size").textContent = nf.format(appliedWorkingText.length) + " символов";
  $("source-size").textContent = nf.format($("source-editor").value.length) + " символов";
  $("stat-mutations").textContent = nf.format(mutations);
  const changed = describeDifference(original, working) === "changed";
  const diff = $("diff-status");
  diff.textContent = changed
    ? "● Рабочая модель отличается от активного snapshot"
    : "● Совпадает с активным snapshot";
  diff.classList.toggle("changed", changed);
  refreshControls();
}
async function createSnapshot() {
  if (workingDirty) throw Error("Сначала примени или отмени правку рабочего JSON");
  // Parse and materialize transactionally: a failed input leaves both old
  // provider and existing WorkingSession untouched.
  const input = JSON.parse($("source-editor").value);
  const nextProvider = new MemoryDocumentProvider({ model: input });
  const nextSnapshot = await nextProvider.openSnapshot();
  const nextOriginal = await nextProvider.read(nextSnapshot, "model");
  const nextSession = await createWorkingSession(nextProvider, nextSnapshot, ["model"]);
  provider = nextProvider;
  snapshot = nextSnapshot;
  original = nextOriginal;
  session = nextSession;
  snapshotNumber++;
  sourceSnapshotText = $("source-editor").value;
  workingDirty = false;
  mutations = 0;
  $("stat-duration").textContent = "—";
  $("stat-source").textContent = "Не изменён";
  $("stat-source").classList.add("stat-green");
  $("verify-result").textContent = "Проверка ещё не выполнялась";
  $("verify-result").className = "verify-result";
  // The suggested operation always matches the newly active snapshot, not
  // the source editor's uncommitted preset.
  if (input && typeof input === "object" && !Array.isArray(input)) {
    if (Object.hasOwn(input, "counter")) $("pointer-path").value = "/counter";
    else if (Object.hasOwn(input, "balance")) $("pointer-path").value = "/balance";
  }
  clearChange();
  syncView();
  status("Snapshot #" + snapshotNumber +
    " создан. Его содержимое закреплено; WorkingSession — отдельная копия.", "success");
  log("Создан snapshot #" + snapshotNumber + " и отдельный WorkingSession");
}
function withAction(name, pointer, action, allowDraft = false) {
  try {
    ensureReady();
    if (workingDirty && !allowDraft) {
      throw Error("Черновик рабочего JSON не применён. Используй «Применить» или «Отменить правку».");
    }
    const before = valueAt(session.getMutableDocument("model"), pointer);
    action();
    const after = valueAt(session.getMutableDocument("model"), pointer);
    workingDirty = false;
    mutations++;
    recordChange(name, pointer, before, after);
    syncView();
    const message = name + " · " + (pointer || "(корень)") +
      ": " + formatValue(before) + " → " + formatValue(after);
    status(message + " · snapshot неизменён · DBMS writes: 0", "success");
    log(message + " · только RAM");
  } catch (error) {
    reportError(error, "Активный WorkingSession не изменён; текст черновика сохранён.");
    refreshControls();
  }
}
function chooseSample(key) {
  if (!Object.hasOwn(samples, key)) return;
  $("source-editor").value = pretty(samples[key]);
  $("source-size").textContent = nf.format($("source-editor").value.length) + " символов";
  for (const button of document.querySelectorAll("[data-preset]")) {
    button.classList.toggle("active", button.dataset.preset === key);
  }
  refreshControls();
  status("Пример «" + (key === "cash" ? "Касса" : "Счётчик") +
    "» выбран только во входном редакторе. Активный snapshot #" +
    snapshotNumber + " и рабочий JSON пока прежние.");
}
function bindClick(id, fn) { $(id).addEventListener("click", fn); }
function lockControls(value) {
  busy = value;
  refreshControls();
}
function downloadJSON() {
  try {
    ensureReady();
    if (workingDirty) throw Error("Нельзя экспортировать при неприменённом рабочем черновике");
    const content = pretty(session.exportDocument("model")) + "\n";
    const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "html-rvm-working.json"; a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("Экспортирован только ПРИМЕНЁННЫЙ рабочий JSON. HTML DBMS не затронут.", "success");
    log("Экспорт активного WorkingSession по явному нажатию");
  } catch (error) { reportError(error); }
}
async function checkIsolation() {
  try {
    ensureReady();
    if (workingDirty) throw Error("Сначала примени или отмени рабочий черновик");
    const pinned = await provider.read(snapshot, "model");
    const intact = describeDifference(pinned, original) === "identical";
    const changed = describeDifference(pinned, session.exportDocument("model")) === "changed";
    $("stat-source").textContent = intact ? "Не изменён" : "Нарушена изоляция";
    $("stat-source").classList.toggle("stat-green", intact);
    $("verify-result").className = "verify-result " + (intact ? "pass" : "fail");
    $("verify-result").textContent = intact
      ? "PASS · активный snapshot #" + snapshotNumber + " неизменён; WorkingSession " +
        (changed ? "отличается" : "совпадает")
      : "FAIL · активный snapshot отличается от эталона";
    status(intact ? "Изоляция подтверждена. Snapshot прежний, RAM может отличаться." :
      "Нарушена изоляция snapshot!", intact ? "success" : "error");
    log("Проверка изоляции snapshot #" + snapshotNumber + ": " + (intact ? "PASS" : "FAIL"));
  } catch (error) { reportError(error); }
}
async function stress() {
  if (busy || workingDirty) return;
  lockControls(true);
  status("Выполняется 1 000 000 прямых изменений рабочего JSON…");
  await new Promise(resolve => requestAnimationFrame(resolve));
  try {
    ensureReady();
    const path = $("pointer-path").value;
    const before = valueAt(session.getMutableDocument("model"), path);
    const result = stressWorking(session, "model", path, 1_000_000);
    const after = valueAt(session.getMutableDocument("model"), path);
    mutations += result.count;
    $("stat-duration").textContent = result.durationMs.toFixed(2) + " мс";
    recordChange("1 000 000 инкрементов", path, before, after);
    syncView();
    status("Выполнено " + nf.format(result.count) + " RAM-изменений за " +
      result.durationMs.toFixed(2) + " мс. DBMS writes: 0.", "success");
    log("Stress / " + path + ": " + formatValue(before) + " → " + formatValue(after));
  } catch (error) { reportError(error); }
  finally { lockControls(false); }
}
async function setBuildInfo() {
  try {
    // Generated by CI from the exact first-parent history of main.
    const response = await fetch("./build-info.json", { cache: "no-store" });
    if (!response.ok) throw Error("Build metadata unavailable");
    const info = await response.json();
    if (info.branch !== "main" ||
        typeof info.commit !== "string" || !/^[0-9a-f]{40}$/.test(info.commit) ||
        typeof info.version !== "string" || !/^(?!00)[0-9]{2}\.[0-9]{2}$/.test(info.version)) {
      throw Error("Invalid build version");
    }
    $("product-version").textContent = "Версия " + info.version;
    $("build-version").textContent = "Версия " + info.version +
      " · HEAD " + info.commit.slice(0, 12);
  } catch {
    // Never invent or silently keep an incorrect version on an incomplete deployment.
    $("product-version").textContent = "Версия недоступна";
    $("build-version").textContent = "Версия недоступна";
  }
}

bindClick("create-snapshot", async () => {
  try { await createSnapshot(); }
  catch (error) { reportError(error, "Предыдущие snapshot и WorkingSession сохранены."); refreshControls(); }
});
bindClick("reset-working", async () => {
  try {
    ensureReady();
    if (workingDirty) throw Error("Сначала отмени или примени черновик");
    session = await createWorkingSession(provider, snapshot, ["model"]);
    mutations = 0;
    $("stat-duration").textContent = "—";
    clearChange();
    syncView();
    status("Рабочая модель сброшена к snapshot #" + snapshotNumber +
      ". Сам snapshot не изменён.", "success");
    log("Рабочая сессия сброшена из активного snapshot");
  } catch (error) { reportError(error); }
});
bindClick("discard-working", () => {
  try {
    ensureReady();
    // Deliberate discard of text only, never a mutation of WorkingSession.
    workingDirty = false;
    syncView();
    status("Неприменённый текст отменён. Активный WorkingSession не изменён.", "success");
    log("Отменён только черновик рабочего редактора");
  } catch (error) { reportError(error); }
});
bindClick("apply-working", () => withAction("Применить JSON", "", () => {
  session.replaceDocument("model", JSON.parse($("working-editor").value));
}, true));
bindClick("increment", () => withAction("Инкремент", $("pointer-path").value, () => {
  const raw = $("increment-amount").value.trim();
  if (!raw) throw Error("Приращение не может быть пустым");
  incrementWorking(session, "model", $("pointer-path").value, Number(raw));
}));
bindClick("try-plus-one", () => withAction("Первый шаг +1", "/counter", () => {
  if (sourceDirty) throw Error("Сначала создай snapshot из входного JSON");
  incrementWorking(session, "model", "/counter", 1);
}));
bindClick("set-value", () => withAction("Установить", $("pointer-path").value, () => {
  setWorking(session, "model", $("pointer-path").value, JSON.parse($("new-value").value));
}));
bindClick("delete-value", () => withAction("Удалить", $("pointer-path").value, () => {
  removeWorking(session, "model", $("pointer-path").value);
}));
bindClick("stress", stress);
bindClick("verify", checkIsolation);
bindClick("export-working", downloadJSON);
bindClick("clear-log", () => {
  $("event-log").replaceChildren();
  status("Журнал очищен. JSON и счётчик мутаций не изменены.");
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
    refreshControls();
    status("Файл загружен только во входной черновик. Snapshot #" +
      snapshotNumber + " и WorkingSession не изменены.");
    log("Локальный импорт файла " + file.name + " (без отправки)");
  } catch (error) { reportError(error, "Прежний входной черновик и активные модели сохранены."); }
  finally { event.currentTarget.value = ""; }
});
$("source-editor").addEventListener("input", () => {
  $("source-size").textContent = nf.format($("source-editor").value.length) + " символов";
  refreshControls();
  if (sourceDirty) status(sourceInvalid
    ? "Неверный JSON во входном черновике. Активный snapshot не изменён."
    : "Входной черновик изменён. Для нового snapshot нажми «Создать снимок».");
});
$("working-editor").addEventListener("input", () => {
  $("working-size").textContent = nf.format($("working-editor").value.length) + " символов";
  refreshControls();
  if (workingDirty) status(workingInvalid
    ? "Неверный JSON в черновике. Активный WorkingSession не изменён."
    : "Рабочий черновик не применён. Примени или отмени правку; экспорт заблокирован.");
});

try {
  await createSnapshot();
  await setBuildInfo();
} catch (error) {
  reportError(error);
}
