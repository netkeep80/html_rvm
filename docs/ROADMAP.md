# План проекта и контроль непрерывности

## Точка BOOT-001

Репозиторий создан с LICENSE; техническая реализация отсутствует. Зафиксирована только проектная архитектура двух независимых систем и предложение DocumentPort/1. Ссылки на чужие репозитории не означают перенос их кода.

## S0 — Canonical requirements / RepoGuard [DRAFT]

- Записать проектные требования, границы, риски и конформанс-матрицу.
- Подключить immutable RepoGuard v6.0.1 в PR CI.
- Честно отразить initial BASE без Requirements (J1/J3 bootstrap gap).
- Независимый аудит exact BASE/HEAD/TREE; отдельная авторская приёмка до merge.

## S1 — DocumentPort/1 MemoryProvider [PLANNED]

- Независимый reader, immutable snapshot, deep copy, typed errors.
- Optional writer с атомарными multi-document changes, optimistic conflict.
- Положительные и отрицательные тесты C01–C09; никакой DBMS в транзитивных зависимостях.

## S2 — HTML RVM VM [PLANNED]

- Модель сущностей/отношений, контекстные ссылки произвольной разрешённой глубины.
- Строгий resolver, разделённые literal/reference/invocation semantics; no eval.
- Безопасность записи и ресурсные лимиты; golden тесты адресации jsonRVM.

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
