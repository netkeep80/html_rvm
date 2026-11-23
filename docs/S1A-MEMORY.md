# S1A — read-only MemoryDocumentProvider и Working JSON

**Статус: Draft PR / NOT_AUTHOR_ACCEPTED / NOT_MERGED.** Это ограниченная исполняемая часть принятой S0-архитектуры. Интерпретатор МО, Writer и DBMS adapter не реализованы.

Основания: [Issue #3 — принятый сравнительный анализ](https://github.com/netkeep80/html_rvm/issues/3), [Issue #4 — исполнительный срез](https://github.com/netkeep80/html_rvm/issues/4).

## 1. API (без изменения DocumentPort/1)

```javascript
import { MemoryDocumentProvider } from "../src/memory-document-provider.js";
import { createWorkingSession } from "../src/working-session.js";

const memory = new MemoryDocumentProvider({ model: { counter: 0 } });
const pinned = await memory.openSnapshot(); // либо "initial"
const original = await memory.read(pinned, "model");

const session = await createWorkingSession(memory, pinned, ["model"]);
session.getMutableDocument("model").counter += 1_000_000;
const selected = session.exportDocument("model");
```

- `MemoryDocumentProvider` реализует **только read capability**. Он не реализует `DocumentWriter.commit`, не предоставляет `write` и не импортирует DBMS.
- `openSnapshot` фиксирует исходное состояние в памяти провайдера. Необязательная строка `"initial"` — локальный locator этого MemoryProvider, **не переносимый** формат между провайдерами. Иные версии пока не существуют.
- Для snapshot возвращается пустой, замороженный, непрозрачный runtime-handle. Его принадлежность проверяется приватным `WeakMap` на **конкретном экземпляре** провайдера. Это не криптографическая capability, а реализация только локальной process/JS-realm boundary.
- `read(snapshot, documentId)` возвращает **целый JSON-документ** и отделённую копию. Ни `pointer`, ни синтаксиса МО в провайдере нет; это сохраняет одобренный DocumentPort/1.
- `createWorkingSession(reader, snapshot, documentIds)` материализует **дополнительную отдельную копию** всех перечисленных документов. Если загрузка любой части неудачна, session не возвращается. Поддельный handle, отсутствующий документ и недействительный JSON приводят к ошибке.
- `session.getMutableDocument(id)` даёт **прямую изменяемую ссылку на временное рабочее состояние** внутри доверенной сессии: для высокочастотных циклов нет копирования целого документа, сериализации или вычисления JSON Patch **на каждом изменении**.
- `session.replaceDocument(id, value)` заменяет документ на проверенную JSON-копию. `session.exportDocument(id)` возвращает проверенную независимую JSON-копию, которую в будущем можно использовать для построения явного ChangeRequest, **не сохраняя автоматически**.
- Открытый снимок и исходные документы неизменны на наблюдаемой границе. Две рабочие сессии, открытые из одного snapshot, изолированы.

## 2. Строгий JSON-домен

`cloneStrictJSON` проверяет runtime-значения на границе провайдера/сессии:

- Допустимы `null`, bool, string, **конечные** числа, массивы и обычные JSON-объекты.
- Запрещены `NaN`, `Infinity`, `undefined`, `BigInt`, функции, символы, циклы, разреженные массивы, дополнительные/неиндексные свойства массивов, accessor/getter, нестандартные прототипы и собственные символные ключи.
- Копирование не вызывает `JSON.stringify` или `toJSON` и не передаёт алиасы на исходные mutable-объекты; ключ `"__proto__"` сохраняется как собственное поле без изменения прототипа.
- Лимиты по умолчанию: глубина не более 128, до 100000 узлов на документ и до 10000 документов в провайдере/сессии. При превышении — `RESOURCE_LIMIT`.
- Правильность изменяемого working JSON **не проверяется на каждой внутренней операции**, чтобы не превращать миллион мутаций в миллион сериализаций. Некорректный результат будет отвергнут при `exportDocument`; последующий интерпретатор должен проверять входы/записи в собственных семантических операциях.

Эта проверка рассчитана на обычные JS-значения. Произвольные JS Proxy могут выполнять пользовательский код внутри их traps: безопасную изоляцию недоверенного исполняемого кода должна обеспечивать **дополнительная среда исполнения**, не `cloneStrictJSON` сама по себе.

## 3. Граница доказательства / матрица

| Критерий | Статус S1A | Где проверяется / ограничение |
|---|---|---|
| C01, C02, C03 | Runtime tests в PR | Stable read, no source alias, missing-vs-null |
| C08, C16 | Runtime tests в PR | Чужой, поддельный, structuredClone handle |
| C09 | Runtime tests в PR | Read-only без writer |
| C15 | **Частично** | Только локальный `"initial"`, без history/commit |
| C17 | **Частично** | Поддельный structuredClone; реальный iframe/Worker-тест позже |
| C18 | **Частично** | Входные границы read-only provider / export session; Writer commit ещё нет |
| C20, C25 | **Частично** | Отдельный рабочий JSON и сессии; исполнения отношения пока нет |
| C21, C22 | **Частично** | 1e6 изменений поля в RAM, zero writer calls; VM execution / tick пока нет |
| C04–C07 | **PLANNED** | Atomic writer/CAS/JSON Patch вне S1A |
| C10–C14, C19, C23, C24, C26 | **PLANNED** | DBMS parity, VM interpreter, persistence intent |

**Важно:** отметка «Runtime tests в PR» не означает PASS до фактического CI; Cxx-заявки здесь ограничены тестируемым срезом. S1A не доказывает производительность миллион операций в секунду: ровно миллион инкрементов в тесте не содержит временного SLA.

## 4. Тестовая веб-среда в том же Draft PR

[GitHub Pages JSON Lab](S1A-PAGES.md) предоставляет управляемые операции с исходным и рабочим JSON для ручного тестирования S1A. Веб-операции — не исполнение Модели Отношений и не DBMS commit; интерфейсный проект DocumentPort/1 не изменён.

## 5. Непринятые решения / следующий этап

S1B: определить базовую графовую идентичность сущностей и интерфейс исполнительного контекста; зафиксировать явное различение literal / reference / invocation и no-op / JSON null. Проверить на golden fixtures из `jsonRVM` и `phprvm`, прежде чем писать сам интерпретатор.

Отдельный более поздний срез — `DocumentWriter` с атомарными CAS и RFC6902. RVM не приобретает эту capability автоматически; `PersistenceIntent` проектируется отдельно.
