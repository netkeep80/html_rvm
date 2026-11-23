# План проекта и контроль непрерывности

## Точка BOOT-001

Репозиторий создан с LICENSE; техническая реализация отсутствует. Зафиксирована авторски принятая архитектура двух независимых систем и проект DocumentPort/1 (runtime ещё не реализован). Решение S0: [BOOTSTRAP-ACCEPTANCE.md](BOOTSTRAP-ACCEPTANCE.md). Ссылки на чужие репозитории не означают перенос их кода.

## S0 — Canonical requirements / RepoGuard [AUTHOR_ACCEPTED 2026-11-23]

- Записать проектные требования, границы, риски и конформанс-матрицу.
- Подключить immutable RepoGuard v6.0.1 в PR CI.
- Явно учесть initial BASE без Requirements (J1 BASE RED, J3 HEAD PASS) и отдельное авторское решение о единичном bootstrap merge без отключения compiler.
- Независимый аудит exact BASE/HEAD/TREE; отдельная авторская приёмка до merge.

## Обязательный принцип исполнения

Исходные документы восстанавливаются из неизменяемого snapshot через провайдер, затем HTML RVM исполняет и самомодифицирует **временную рабочую JSON-модель в памяти**. Частые изменения рабочих значений (включая высокочастотные циклы) не приводят к физическим append/commit в DBMS. Только явная сущность сохранения МО может сформировать нейтральный ChangeRequest, исполняемый при отдельном разрешении trusted host/ChangeGateway. Схема этой сущности остаётся решением S2. Проверить C20–C26; не считать их пройденными в BOOT-001.

## S1A — MemoryDocumentProvider read-only + Working JSON [DRAFT / NOT_ACCEPTED]

- Один узкий implementation PR по [Issue #4](https://github.com/netkeep80/html_rvm/issues/4), в развитие принятых направлений [Issue #3](https://github.com/netkeep80/html_rvm/issues/3). [Точная граница S1A](S1A-MEMORY.md).
- Независимый только read-only DocumentReader, immutable snapshot, runtime-проверка handle по provider instance, strict JSON clone, typed errors.
- Отдельный mutable JSON в каждом working session, ноль скрытых вызовов writer; тесты C01–C03/C08/C09/C16/C18/C20/C25 в применимой части. C17/C21/C22 лишь частично; проверка миллиона инкрементов НЕ измеряет throughput VM.
- [Тестовый JSON Lab на GitHub Pages](S1A-PAGES.md) — включён в PR #5, без VM/DBMS: исходный JSON, отдельное рабочее состояние, ручные операции, миллион инкрементов, проверка изоляции и явный экспорт. По прямому указанию автора публикация GitHub Pages запускается **только из main** после merge. Публикация тестового сайта ≠ релиз или завершённый интерпретатор МО.
- Не считать реализацию read-only провайдера доказательством полной совместимости DocumentPort/1.

## S1A.1 — UX исправления JSON Lab [DRAFT / NOT_ACCEPTED]

- [Issue #9](https://github.com/netkeep80/html_rvm/issues/9) по независимому UX-аудиту: BLOCK · P1=0, P2=4, P3=3. [Scope и модель состояния](S1A-UX.md).
- Входной и рабочий черновики отличаются от активного snapshot/WorkingSession; неприменённый рабочий текст блокирует операции и экспорт. Видны конкретные before→after, активный snapshot и RAM lifetime.
- Без полной Studio, новых UI-зависимостей, DBMS и изменения DocumentPort. Независимый браузерный повтор необходим перед UX acceptance.

## VERS-001 — автоматическая версия XX.YY на GitHub Pages

- [Issue #7](https://github.com/netkeep80/html_rvm/issues/7), [PR #8](https://github.com/netkeep80/html_rvm/pull/8): версия от архитектурного baseline PR #2, `01.00` и счётчик обычных двухродительских merge в main (после PR #10 `01.03`; следующий merge увеличивает YY).
- [Полный протокол](VERSIONING.md): проверка точной Git-истории, отдельный `VERSION` artifact и видимая версия в шапке/футере сайта.
- Pages workflow пересчитывает номер и публикует при **каждом** main push, даже docs-only. Версия — техническая метка сборки, а не свидетельство готовой VM или DBMS.

## S1B+ — Writer/интерпретатор [PLANNED]

- Optional DocumentWriter с атомарным multi-document CAS/RFC6902 — отдельный проектный срез, без прямого DBMS API в VM.
- Самостоятельные тесты C04–C07, C17 iframe/Worker, границы строгого JSON при commit.

## S2 — HTML RVM VM [PLANNED]

- Модель сущностей/отношений, контекстные ссылки произвольной разрешённой глубины.
- Строгий resolver RFC 6901 после полнодокументного read, разделённые literal/reference/invocation semantics; no eval. C19 проверяет, что `pointer` и контекстная адресация принадлежат RVM.
- Безопасность записи и ресурсные лимиты; golden тесты адресации jsonRVM.
- Временная JSON working copy независимо от immutable provider snapshot; самоизменение в памяти без автоматического commit, даже при миллионных циклах.
- Явная сущность намерения сохранения как понятие МО, нейтральный ChangeRequest, capability check и отказ без writer; тесты C20–C26.

## S3 — Универсальный DBMS JSON store и adapter [PLANNED]

- Отдельное решение / issue в html_dbms о generic JSON-document chain.
- Root Registry хранится на стороне DBMS adapter, не внутри RVM.
- Snapshot consistency, immutable genesis, monotonic heads, trust anchor.
- Подготовка нескольких версий, независимый полный replay/verify и атомарная публикация main.
- Contract parity C10–C15 и негативные тесты.

## S4 — Касса / Склад [PLANNED]

- Обезличенный импорт, явные роли отправителя/получателя, дата, сумма и тип финансового события.
- Проводки и балансы проверяются независимо от UI и независимо от storage provider.
- Отдельно обрабатываются отсутствие цены, единицы измерения, план/факт, поздние проводки и исправления.
- Никаких реальных персональных данных в публичном CI.

## Непринятые предложения

- Физическая DBMS 2.3 policy — не утверждена.
- Runtime bundle из зашифрованной цепочки не запускается автоматически.
- Полноценная файловая система, SQL, глобальный index entity IDs, realtime sync не входят в S0.

Релиз, merge, CI GREEN и авторская приёмка — разные факты. Не объявлять ACCEPTED или PUBLISHED по готовности PR.
