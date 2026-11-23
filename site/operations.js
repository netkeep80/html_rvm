// UI-only operations on an already isolated WorkingSession.
// JSON Pointer belongs to the consumer, never to DocumentPort/1.
import { cloneStrictJSON } from "../src/strict-json.js";
import { portError } from "../src/document-port-error.js";

export function pointerTokens(pointer) {
  if (typeof pointer !== "string" || (pointer !== "" && !pointer.startsWith("/"))) {
    throw portError("INVALID_REFERENCE", "JSON Pointer должен быть пустым или начинаться с /");
  }
  if (pointer === "") return [];
  return pointer.slice(1).split("/").map(raw => {
    if (/~(?![01])/.test(raw)) {
      throw portError("INVALID_REFERENCE", "Недопустимая escape-последовательность JSON Pointer");
    }
    return raw.replace(/~1/g, "/").replace(/~0/g, "~");
  });
}

function keyOf(node, token) {
  if (Array.isArray(node)) {
    if (!/^(0|[1-9][0-9]*)$/.test(token)) {
      throw portError("INVALID_REFERENCE", "Индекс массива должен быть 0 или целым без ведущих нулей");
    }
    const index = Number(token);
    if (!Number.isSafeInteger(index)) {
      throw portError("INVALID_REFERENCE", "Индекс массива вне точного диапазона");
    }
    return index;
  }
  if (node !== null && typeof node === "object") return token;
  throw portError("PATH_NOT_FOUND", "Адрес ведёт через не-контейнерное JSON-значение");
}

function has(node, key) {
  return Object.hasOwn(node, key);
}

function target(root, pointer, existing = true) {
  const tokens = pointerTokens(pointer);
  if (!tokens.length) return { root: true };
  let current = root;
  for (const token of tokens.slice(0, -1)) {
    const key = keyOf(current, token);
    if (!has(current, key)) {
      throw portError("PATH_NOT_FOUND", "Промежуточный сегмент JSON Pointer не найден");
    }
    current = current[key];
  }
  const key = keyOf(current, tokens.at(-1));
  if (Array.isArray(current) && key >= current.length) {
    throw portError("PATH_NOT_FOUND", "Индекс за границами массива");
  }
  if (existing && !has(current, key)) {
    throw portError("PATH_NOT_FOUND", "JSON Pointer не существует");
  }
  return { parent: current, key, root: false };
}

export function getPointer(root, pointer) {
  const t = target(root, pointer, true);
  return t.root ? root : t.parent[t.key];
}

export function setWorking(session, id, pointer, newValue) {
  const safeValue = cloneStrictJSON(newValue);
  const t = target(session.getMutableDocument(id), pointer, false);
  if (t.root) session.replaceDocument(id, safeValue);
  else Object.defineProperty(t.parent, t.key, {
    value: safeValue, writable: true, configurable: true, enumerable: true
  });
  return safeValue;
}

export function removeWorking(session, id, pointer) {
  const t = target(session.getMutableDocument(id), pointer, true);
  if (t.root) throw portError("INVALID_REFERENCE", "Удаление корня запрещено; используйте замену");
  const previous = t.parent[t.key];
  if (Array.isArray(t.parent)) t.parent.splice(t.key, 1);
  else delete t.parent[t.key];
  return previous;
}

export function incrementWorking(session, id, pointer, amount = 1) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw portError("INVALID_REFERENCE", "Приращение должно быть конечным числом");
  }
  const t = target(session.getMutableDocument(id), pointer, true);
  const value = t.root ? session.getMutableDocument(id) : t.parent[t.key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw portError("INVALID_REFERENCE", "По указанному адресу нет конечного числа");
  }
  const next = value + amount;
  if (!Number.isFinite(next) ||
      (Number.isSafeInteger(value) && Number.isSafeInteger(amount) && !Number.isSafeInteger(next))) {
    throw portError("RESOURCE_LIMIT", "Число выходит за допустимые пределы");
  }
  if (t.root) session.replaceDocument(id, next);
  else t.parent[t.key] = next;
  return next;
}

export function stressWorking(session, id, pointer, repetitions = 1_000_000) {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 1_000_000) {
    throw portError("RESOURCE_LIMIT", "Допустимо от 1 до 1 000 000 операций");
  }
  const t = target(session.getMutableDocument(id), pointer, true);
  const first = t.root ? session.getMutableDocument(id) : t.parent[t.key];
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(first + repetitions)) {
    throw portError("INVALID_REFERENCE", "Stress-тест требует безопасного целого числа");
  }
  const start = performance.now();
  if (t.root) {
    let next = first;
    for (let i = 0; i < repetitions; i++) next++;
    session.replaceDocument(id, next);
  } else {
    for (let i = 0; i < repetitions; i++) t.parent[t.key]++;
  }
  return { count: repetitions, value: first + repetitions, durationMs: performance.now() - start };
}

export function describeDifference(source, working) {
  // UI indicator only: JSON equality of independently serialized objects.
  return JSON.stringify(source) === JSON.stringify(working) ? "identical" : "changed";
}
