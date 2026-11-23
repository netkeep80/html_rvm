# HTML RVM — Product Vision source basis

Статус: **REQ-NORM-001 candidate source artifact**. Документ не создаёт новую authority и не заменяет принятые S0 Requirements; он фиксирует, откуда взяты корневые GOAL-кандидаты для проверки source-backing.

## Источники stakeholder intent

1. [Issue #1 — BOOT-001](https://github.com/netkeep80/html_rvm/issues/1): авторская проектная позиция о самостоятельной RVM, самостоятельной DBMS, нейтральном DocumentPort, resolver внутри RVM и host-controlled commit. После независимого аудита S0 это направление было отдельно авторски принято и зафиксировано в [BOOTSTRAP-ACCEPTANCE.md](BOOTSTRAP-ACCEPTANCE.md).
2. [Issue #3 — S1-RESEARCH](https://github.com/netkeep80/html_rvm/issues/3): исследовательское сравнение jsonRVM/phprvm фиксирует желаемое минимальное browser VM ядро: JSON execution, context/entity semantics, transient mutable working state и отсутствие автоматического persistence. Сам Issue #3 остаётся research/proposal и не является принятой authority.
3. [ARCHITECTURE.md](ARCHITECTURE.md): принятые S0 границы независимости runtime/storage и обязательное отделение WorkingSession от immutable provider snapshot.

## Candidate product goals

- **GOAL-001 — наблюдаемое browser execution:** пользователь должен иметь возможность исполнять и наблюдать преобразования МО над JSON без обязательного persistent storage. Основание: Issue #1 principles 1/3/4 и исследовательское направление Issue #3.
- **GOAL-002 — безопасное экспериментирование с working state:** самоизменение рабочего JSON должно быть возможно без неявного сохранения промежуточных состояний. Основание: принятый S0 working/persistence invariant и Issue #3.
- **GOAL-003 — независимое развитие runtime/storage:** RVM и storage должны эволюционировать независимо и соединяться нейтральной границей. Основание: Issue #1 principles 1–3 и принятый S0 ARCH/PORT.

Эти GOALs являются кандидатной нормализацией уже выраженного stakeholder intent. Их принятие всё равно требует отдельного author acceptance вместе с normalized graph.
