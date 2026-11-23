# BOOT-001 — авторская приёмка первоначального S0 baseline

**Дата:** 23 ноября 2026. **Решение:** AUTHOR_ACCEPTED архитектура S0, 16 канонических требований, разрешён штатный merge PR #2 с точно описанным разовым bootstrap-gap. Не является свидетельством реализованного runtime или готовности к релизу.

## Основание и точная версия

Автор подтвердил архитектуру HTML DBMS / HTML RVM, потребовал **временный самомодифицируемый JSON**, восстановленный из цепочки DBMS, и **явное сохранение через сущность МО**, затем прямо распорядился: «да, теперь всё фиксируем, и мержим».

- [Issue #1 — запись точного авторского решения](https://github.com/netkeep80/html_rvm/issues/1#issuecomment-7103952294).
- [PR #2 — первоначальный baseline](https://github.com/netkeep80/html_rvm/pull/2).
- **Первоначальный BASE:** `fc60a877840c76f64b182ad404d139ef6e22b6ed` (TREE `188ddd4c79e3318f6d2addb87b07d2bc8fbe7a03`), только LICENSE.
- **Содержательный принятый кандидат:** HEAD `bb60db74fa07e7a6d80df566910353858c32a7bd` / TREE `d7953d4a0ec31d40954ef9ca263b18dcac3b20c9`.
- В завершающем commit фиксируются lifecycle-факты принятых требований. Его SHA и итоговый main SHA заносятся в Issue после успешных операций; заранее их не выдумывать.

## Принятое нормативное содержание

1. Независимые ядра `html_rvm` и `html_dbms`, соединяемые только optional adapter. Root Registry принадлежит адаптеру.
2. `DocumentPort/1`: reader `openSnapshot(reference?)` и whole-document `read(snapshot, documentId)`. JSON Pointer и контекстная адресация — внутри RVM. Writer `commit` — отдельная необязательная capability хоста.
3. RVM исполняет отношения над **отдельной временной JSON-моделью в памяти**, восстановленной из immutable provider snapshot. Самомодификация не вызывает DBMS append/commit. Высокая частота внутренних изменений допускается как проектная цель, но не измерена.
4. Постоянное сохранение результата исполнения МО представлено **явной сущностью/намерением МО** → нейтральный `ChangeRequest` с base → разрешение trusted host / ChangeGateway → writer. Каждая промежуточная модификация не сохраняется.
5. Формат PersistenceIntent, Root Registry, generic JSON policy DBMS и исполнение C01–C26 — отдельные будущие решения/реализация.
6. Канонические Requirements этого первого baseline: `accepted=true`, `current=true`, `published=false`. Публикация релиза — отдельное решение.

## One-time initial RepoGuard exception

В исходном BASE отсутствовала нормативная authority для единственного LICENSE. [CI #45192598174](https://github.com/netkeep80/html_rvm/actions/runs/45192598174) показал: **структурные тесты 5/5 PASS**, RepoGuard HEAD J1 **26/26**, J2 **16 rooted**, J3 PASS; **общий RED**, одна диагностика:

```json
{"code":"unjustified_resource","subject":"fc60a877840c76f64b182ad404d139ef6e22b6ed:LICENSE"}
```

Автор сознательно разрешил **только первый bootstrap merge с этим RED**. Запрещено представлять RED как GREEN, ослаблять/отключать RepoGuard, обходить GitHub branch protection или переносить исключение на будущие PR. На принятом requirement-bearing BASE следующие изменения обязаны проверяться штатно.

## Предел приёмки

Независимый read-only аудит предоставлен по предыдущим снимкам (включая `da157e3`). Последний содержательный WORK/PERSIST delta не имеет отдельного независимого заключения; решение о merge автор дал с известными ограничениями. Структурный тест и RepoGuard traceability не доказывают реальную работу VM, частоту миллионов изменений или корректность будущей DBMS-интеграции.
