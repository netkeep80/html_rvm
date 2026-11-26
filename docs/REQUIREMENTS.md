# Требования — язык и authority

Единственный нормативный источник: versioned requirements/*.rg.yaml в формате repo-guard/requirement-v1. Тексты в README, документах и Issues — объяснения, но не вторые нормативные требования.

Изначальный S0 baseline использует IDs HRVM-PRODUCT-000, HRVM-PROJECT-000, HRVM-ARCH-001, HRVM-PORT-001, HRVM-SNAP-001, HRVM-READ-001, HRVM-WRITE-001, HRVM-REF-001, HRVM-ADAPT-001, HRVM-SEC-001, HRVM-TEST-001, HRVM-CASE-001, HRVM-LICENSE-001, HRVM-BOOT-001, HRVM-WORK-001, HRVM-PERSIST-001. Срез REQ-NORM-001 добавил **непринятый параллельный candidate graph** с многочастными IDs вида `HRVM-PORT-READER-001`; это не меняет authority старых требований до отдельной миграционной приёмки.

Иерархия: PRODUCT — корневая предметная цель. PROJECT — дисциплина управления; ARCH — независимость систем; PORT — минимальный интерфейс; SNAP/READ/WRITE — его наблюдаемая семантика; REF — семантика RVM; ADAPT — DBMS интеграция; SEC — граница доверия; TEST — свидетели; CASE — применение на обезличенной кассе и складе; LICENSE — самостоятельная лицензия распространения; BOOT — проверяемые структурные границы начальной спецификации, не проверка всей дисциплины governance; WORK — временная самомодифицируемая JSON-модель, изолированная от immutable provider snapshot; PERSIST — явная сущность сохранения МО, не являющаяся непосредственным DBMS commit.

Автор 23.11.2026 явно принял первоначальный S0 baseline из 16 требований, включая WORK (отдельное временное самомодифицируемое JSON-состояние) и PERSIST (явное сохранение как сущность МО), и разрешил merge PR #2 с отдельным одноразовым исключением для первоначального RepoGuard BASE. [Запись решения, точные SHA, ограничение доказательства](BOOTSTRAP-ACCEPTANCE.md).

В production 01.05 все 16 требований первоначального baseline: **accepted=true, current=true, published=false**. В предлагаемом REQ-AUTH-001 (#13) графе 11 остаются current, 5 сохраняют accepted=true и становятся historical (current=false), 34 audited replacements становятся accepted/current. Остальные 12 остаются candidates, published=0. Флаги Draft-кандидата описывают предлагаемое состояние после отдельной авторской приёмки; CI и merge сами по себе не являются приёмкой. Это означает принятие нормативной архитектуры, но НЕ реализованный VM runtime, НЕ подтверждение C01–C26 и НЕ выпуск релиза. Merge сам по себе не меняет `published`.

Требования описывают наблюдаемый результат и границу полномочий, не предписывают ненужную реализацию или полную файловую систему. Отношения документов/реализации связывают конкретные tracked Resources; `verified_by` используется только при наличии исполняемого свидетельства **всего** соответствующего атомарного утверждения в заявленном scope. Частичная проверка темы не является `verified_by`.

По независимому requirements-engineering аудиту введён normalization slice [REQ-NORM-001](REQUIREMENTS-NORMALIZATION.md): уровень GOAL → USER → atomic requirement, [канонический glossary](GLOSSARY.md), versioned [priority-map](../requirements/metadata/priority-map.json) и mapping legacy→atomic. Pinned RepoGuard v6.0.1 не допускает произвольное top-level поле `priority` в native Requirement, поэтому приоритет хранится в проверяемом sidecar вместо невалидного расширения формата.

Критерии приёмки изложены в docs/DOCUMENT-PORT-1.md (C01–C26). До реализации это план испытаний, а не доказательство. Точное различение planned / implemented / tested обязательно.

Тест `tests/bootstrap-contract.test.mjs` проверяет только структуру документации, TypeScript-декларации, имена и отношения требований, явно запрещённые импорты и закрепление RepoGuard. Он не подтверждает факт авторской приёмки, полноту графа зависимостей или поведение RVM. Отдельный `HRVM-BOOT-001` ограничивает scope `verified_by` именно этим исполняемым наблюдением.

Первоначальный BASE содержит только LICENSE и не имеет Requirement authority. Автор разрешил **один bootstrap merge с известным RepoGuard RED**, но не признал RED проверкой PASS, не разрешил отключать компилятор и не распространил исключение на будущие PR. Точная диагностика и источник решения — в BOOTSTRAP-ACCEPTANCE.md.

S0, S1A, S1A.1, VERS-001 и REQ-NORM-001 завершены. После отдельной приёмки REQ-AUTH-001 — семантическое ядро МО / executable RVM, затем явная сущность сохранения и независимый DBMS adapter.

## Дельта executable JSON / parity / compactness — 26.11.2026

Авторская директива [#18/7202378622](https://github.com/netkeep80/html_rvm/issues/18#issuecomment-7202378622) и [#29/7202383209](https://github.com/netkeep80/html_rvm/issues/29#issuecomment-7202383209) задаёт новый обязательный критерий практической программы. Нормативная регистрация отдельными кандидатами в `requirements/research/`: HRVM-MO-EXEC-001 (исполняемая проекция), HRVM-MO-PARITY-001 (функциональная эквивалентность), HRVM-MO-COMPACT-001 (компактность и ясность). Флаги lifecycle кандидатов не утверждают их принятие; отдельный независимый аудит и явная авторская приёмка exact HEAD необходимы. Не менять исторический partition REQ-AUTH-001 и его frozen evidence; три новых research IDs учитываются отдельно от 62 исторических top-level IDs. Никаких verified_by до полного исполняемого свидетельства. [Маршрут и протокол](S1B-PARITY-COMPACT.md).
