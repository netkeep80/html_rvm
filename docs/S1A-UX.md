# S1A.1 — устранение UX BLOCK JSON Lab

**Status: implementation Draft / NOT_AUTHOR_ACCEPTED / NOT_MERGED.**

Основание: независимый read-only UX-аудит опубликованного S1A от автора: **BLOCK · P1=0 · P2=4 · P3=3**; [Issue #9](https://github.com/netkeep80/html_rvm/issues/9). Исследованный аудитором artifact соответствовал merged PR #5 (main `08c8d4d…`). Разрабатываем исправления от более позднего actual main `5105eeb…` (PR #6 изменил только README). PR #8 версионирования развивается независимо.

## Модель UI

HTML RVM S1A использует не два, а четыре различных состояния:

1. **Входной текст** — черновик источника. Изменяется вручную или через preset/import. Если отличается от последнего применённого: DIRTY/INVALID. Не является опубликованным snapshot.
2. **Активный snapshot #n** — зафиксированное провайдером неизменяемое JSON-состояние. Меняется только после явного нажатия «Создать snapshot», успешного parse/validation/materialization.
3. **Рабочий текст** — редактируемый черновик для WorkingSession. DIRTY/INVALID не изменяет фактическую модель, пока не нажато «Применить».
4. **Активный WorkingSession** — отдельный временный JSON в оперативной памяти. Только он изменяется прямыми операциями. При смене snapshot и reset материализуется заново.

Для каждого редактора предусмотрены состояния **APPLIED / DIRTY / INVALID** с отдельной поясняющей надписью. Не применяется автоматически ни при редактировании, ни при экспорте.

### Fail-closed при рабочем черновике

Когда `workingDirty` или `workingInvalid` — **операции, стресс, экспорт, reset и контроль изоляции недоступны**; пользователь может явно «Применить» валидный текст или «Отменить правку» (восстанавливает редактор из текущего WorkingSession без его изменения). Ошибка парсинга не изменяет WorkingSession и не стирает введённый текст. «Создать snapshot» также недоступен до разрешения конфликта с черновиком.

Выбор preset «Касса»/«Счётчик» меняет только входной черновик и его DIRTY-флаг. Он не заменяет snapshot, WorkingSession или адрес операций до «Создать snapshot». Snapshot имеет явный последовательный локальный номер #n. При ошибке входного JSON сохраняется действующий snapshot.

### Наблюдаемое исполнение

В начале страницы есть сценарий «Попробовать +1», видимый без прокрутки до блока операций. Результат всегда сообщает точный указатель, **до → после**, значение из активного snapshot и `DBMS writes = 0`. Такой же маленький trace обновляется после increment, set, delete, ручного apply и 1 000 000 инкрементов. При reset trace очищается.

`deepEqualJSON` сравнивает значения JSON структурно: порядок ключей object не важен, порядок элементов array важен, `null` отличается от отсутствующего поля. UI больше не использует stringification для диагностики равенства (но использует обычный `JSON.stringify` для форматирования вывода значения).

У рабочей панели явно написано: **вся RAM-сессия исчезает при перезагрузке страницы**. Экспорт — только по явному клику и только при отсутствии неприменённого черновика. На экранах <=340px сокращается верхняя ссылка, у архитектурной карточки убран минимум ширины.

## Верификация

- Новые `tests/playground-ui-state.test.mjs` запускают реальные JS event handlers в Node имитации DOM: source preset without changing active snapshot; 777 draft vs exported 1000 regression (export **disabled**); cancel/apply/export matching visible state; trace `/counter: 0→1`, invalid source/working text preserves active session.
- `tests/playground-operations.test.mjs`: структурный JSON comparator independent of object property order, sensitive to array order and null vs missing.
- Сохраняются существующие S0/S1A contract tests и RepoGuard.
- **Ограничение доказательства:** Node DOM harness — не настоящая проверка Chromium, visual layout или mobile overflow. Нужен повторный независимый browser audit exact GitHub Pages artifact и проверка acceptance 18 пунктов аудита.

## Out of scope

DocumentPort/1, MemoryDocumentProvider и WorkingSession implementation unchanged. Не добавлять DBMS, Writer, iframe, full JSON tree, diff-editor, JS eval, сторонний UI framework или интерпретатор МО. PR #8 с XX.YY и версионированием не изменяется.

## Acceptance gates

Issue-first → узкий Draft PR → exact CI/RepoGuard PASS → отдельный независимый READ-ONLY delta-аудит P1/P2/P3 → explicit author acceptance → merge в main → live Pages confirmation. Исправление кода не является автоматической повторной приёмкой UX-аудита.
