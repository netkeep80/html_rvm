# S1B-PARITY-COMPACT — обязательная практическая программа

Статус: авторская директива, проектный протокол; не RESULT, не готовая VM, не утверждённая грамматика. Источники: [#18/7202378622](https://github.com/netkeep80/html_rvm/issues/18#issuecomment-7202378622), [#29/7202383209](https://github.com/netkeep80/html_rvm/issues/29#issuecomment-7202383209). Исполнение PC0–PC4 после V1–V3; инвентаризация ниже подготовлена без запуска параллельной реализации.

## Различать три представления

V — обычные данные JSON (частичная проекция значения), G — точный lossless codec полного состояния N/P, C — компактная человекочитаемая исполняемая JSON-проекция МО. C задаёт денотацию в МО и обратную проекцию на явно определённом профиле (roundtrip до заявленной эквивалентности с сохранением всех наблюдаемых особенностей). Отдельно исследовать ambiguity/escaping, missing/null, order, literal/ref/invocation, VIEW/EXEC, отражение и самоизменение. Не объявлять JSON-дерево или tagged N/P таблицу языком C. Не вводить сценарный JS helper или список R0 операций вместо математической структуры; общая библиотека допустима только как объявленная часть профиля с явной семантикой, без скрытых программных определений.

## Маршрут

| Slice | Предмет | Выход |
|---|---|---|
| PC0 | Закреплённый корпус, старый oracle, окружение, транзитивные зависимости, наблюдения, протокол сравнения до выбора кандидата | Инвентарь, actual legacy runs либо точный blocker |
| PC1 | Минимальный исполняемый C: literal/ref/invocation, lambda-структура/вектор, назначение, default roles, VIEW/EXEC | Денотация и обратимость профиля, version/where/minimal ref mutations, негативные случаи |
| PC2 | Абсолютная/относительная адресация, E/S/R/O, родительские контексты, sharing/copy/view, reflective mutation, исключения | Реальное исполнение fixtures и изменённого кода, наблюдения identity/alias/context |
| PC3 | performance.json + #.json dependency closure, фильтрация, вычисления, отчёты, XML, throw/catch, файловая база | Реальные программы, сравнение источников/результатов, безопасные deterministic host adapters |
| PC4 | Полный корпус, функциональная эквивалентность и компактность | Независимый аудит, авторская приёмка; только затем V4/V5 |

Никаких изменений R0 без конкретного контрпримера и отдельного решения. D2b–d/D3/D4/A0 интегрировать в эти практические срезы; historical OPEN/BLOCK не закрывать по факту появления UI или C. DocumentPort/1, изоляция, trusted host authorization, explicit persistence intent обязательны; не делать production DBMS claims. Реальные приватные/индустриальные данные, секреты и unrestricted host I/O не публиковать в CI; substitutions явно маркировать.

## Закреплённый исторический корпус

[jsonRVM / modules/console/test](https://github.com/netkeep80/jsonRVM/tree/9d5f2000aba2c2ece0121f1d6bc84721a8728e7a/modules/console/test), commit `9d5f2000aba2c2ece0121f1d6bc84721a8728e7a`, root TREE `38c6093318d4367ccb844961c92af517901e602e`, corpus subtree `91876c9162327a18748c9eb6758cad1fdeaba9c2`. Инвентарь Git tree (не выполнение): 22 файла, 15 JSON; raw byte sizes and Git blob SHA-1. #.json не загружался целиком и не анализировался в этой подготовительной дельте.

| Файл | Raw bytes | Git blob |
|---|---:|---|
| `#.json` | 11738942 | `59e29c60fe8e12f484f2d5da53719c1de5eb3e6a` |
| `.gitignore` | 36 | `4469ddb08ce8141fcf44004e23aedb8a769bec38` |
| `CMakeLists.txt` | 1776 | `a27819db529a5a691801ad02d45897109802c86b` |
| `ToXML.test.json` | 2070 | `6c6fe60e5e68a1953ad920982624745bb4675d53` |
| `absolute_addressing.bat` | 78 | `2178c1139197fc6cd696c2b0e444920be3e5b5d2` |
| `absolute_addressing.json` | 1280 | `f07551bcdd97c726ff10418b9910829bdc70981c` |
| `catch.test.json` | 258 | `cf090bc2ca75e7a2f793673d84e7feed911a8ebf` |
| `ent1.json` | 19 | `5bb00264f3c5516b29c516ffdcf33bde7ca8ec96` |
| `ent2.json` | 19 | `ff7ad65fc13763b242d21b6d59ee89d0d95daf4f` |
| `file_database_test.json` | 140 | `b35a6a9f79d7ed3b41bcb0ce500f32c1d9aac092` |
| `main.cpp` | 11422 | `aaa60d59299e59567422461a8f98600a2aa38599` |
| `performance.bat` | 710 | `08bfcda6f33d2defa539a754076ad7c42f27066e` |
| `performance.json` | 919 | `a4d567df6de219db20d6e71739e2218292bcd097` |
| `relative_addressing.bat` | 78 | `3de826168d7de6198b4da387685282df62d7cae4` |
| `relative_addressing.json` | 6603 | `c6281863a6e3295022c8979b54624263bac78b71` |
| `throw.rose.test.json` | 123 | `ab3459f68025d3726a6143daef49b4f0784328f1` |
| `throw.test.json` | 102 | `75e381a22a3416b709b6e0e532f0b4b51c8db0c1` |
| `version.bat` | 66 | `089f5dde16c9bd1b0428b1c576e1aa130f32fe03` |
| `version.json` | 72 | `1eb37f6dfc23ad1e7c9235fd0652a913db4283f3` |
| `version.rose.json` | 64 | `9899a2a0e91e385694b5c8237e7cf72caa4353f0` |
| `where_test.json` | 144 | `a08ebf60f5c1bfb439731a5b7edb8fa760724247` |
| `where_test.rose.json` | 190 | `3f85f217fd2855a0365abf2c0758658e75e451ca` |

main.cpp / CMakeLists.txt: 5 активных тестов (28 CHECK: 3 absolute, 16 relative, 1 version, 1 where, 7 report rows). Историческое version assertion 3.0.0 не hardcode для нового продукта. ROSE — candidate, не считать доказанной динамической паритетностью. performance.json вызывает CalculateMeanValues, CalculateTotalValues, PrepareFullReport, SaveFullReport2, SaveShortReport2; требуется установить dependency closure, а не воспроизводить только его семь внешних шагов. Данные измерений отделять от исполняемого источника; не публиковать сам #.json без проверки данных. Старый runtime ещё не собран и не запущен этой дельтой.

## Сравнительный протокол

До исполнения зафиксировать case ID, старый и новый source с транзитивным сценарием, вход/окружение и observations (output, errors, effects, identity, alias, context, reflection, deterministic trace). Фактически исполнить оба; ожидаемое из CHECK не заменяет observed legacy result. Если oracle недоступен, явно BLOCK, не подменять legacy результат. Version/time/host effects сравнивать по объявленным контрактам и deterministic adapters. Показывать pretty old/new рядом и реальные результаты в Studio.

Измерять minified UTF-8 по единой задокументированной канонизации, без выигрыша от пробелов, без изменения значимого порядка или числовой семантики. Считать полную исполняемую scenario-specific dependency closure один раз по явной методике; данные отдельно; generic vocabulary differences задокументировать. На каждый case: old/new bytes, ratio, counts role/ref wrappers, nesting depth, context/support definitions, readability author review. Агрегат comparable executable source строго меньше legacy; каждый рост и intentional difference подлежит отдельному авторскому решению. Не задавать процент без автора; меньший но менее способный/неоднозначный источник не успех. Не утверждать абсолютную минимальность всех N/P графов. Performance измерять после корректности, не вместо компактности.

Статусы: PC0 baseline inventory PREPARED (metadata only); old oracle NOT_RUN; PC1–PC4 NOT_STARTED. V1–V3 не означают PC4 PASS.
