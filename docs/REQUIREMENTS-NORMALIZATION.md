# REQ-NORM-001 — нормализация требований по независимому аудиту

## 1. Цель

Не менять принятые архитектурные решения, а сделать их формально атомарными и точнее трассируемыми до того, как семантика МО разрастётся. Исходные 16 S0 Requirements остаются **accepted/current** в этом Draft. Новые Requirements — параллельный **candidate normalized graph** с lifecycle `accepted=false,current=false,published=false`.

Актуальная база на начало среза: main `a6b263cf034f25ee668712dec4bcb4d73059b7aa`, TREE `d58997e2dff9547f6913b481e19615dd4d4abe74`; 17 native Requirement файлов: 16 accepted S0 + candidate HRVM-VERSION-001.

## 2. Почему sidecar priority, а не новое поле Requirement

Pinned RepoGuard v6.0.1 принимает в native Requirement только `format,id,normative,lifecycle,relations,constraints` и отвергает unknown fields. Поэтому `priority:` внутри `.rg.yaml` был бы невалидным контрактом. Явная приоритизация хранится в versioned `requirements/metadata/priority-map.json` и проверяется тестом на полное покрытие каждого Requirement ID.

Шкала:
- **MUST_FOR_NEXT_STAGE** — specification/implementation evidence требуется до принятия следующего этапа roadmap.
- **SHOULD** — важное требование, но оно не блокирует ближайший этап.
- **LATER** — принятое/кандидатное требование более позднего этапа; не должно преждевременно раздувать текущую реализацию.

## 3. Правило атомарности

Для candidate IDs этого среза:
- один ID выражает один независимо принимаемый и проверяемый инвариант;
- normative содержит ровно один токен `MUST` и не использует `SHOULD/MAY`; это **синтаксический guard**, а не доказательство семантической атомарности;
- дополнительные пояснения могут уточнять границы этого же инварианта, но не добавлять вторую independently deployable обязанность;
- разные моменты реализации/проверки => разные IDs;
- семантическую атомарность окончательно подтверждает independent review: один `MUST` сам по себе не гарантирует один независимо проверяемый инвариант.

Первый срез атомизирует legacy `PORT-001`, `WRITE-001`, `PERSIST-001`, `REF-001`, `TEST-001`. Остальные compound S0 Requirements остаются предметом следующих normalization slices.

## 4. Трассируемость вверх

Candidate graph добавляет уровень:

`GOAL → USER → atomic requirement → artifact/test`.

GOAL отвечает «зачем продукт существует», USER — «что пользователь/host должен иметь возможность сделать», atomic — один наблюдаемый/архитектурный инвариант. Source basis корневых целей фиксируется отдельно в [PRODUCT-VISION.md](PRODUCT-VISION.md) и ссылается на stakeholder-origin Issues/accepted S0 artifacts, не переворачивая иерархию derives_from. Для сохранения принятой authority atomic Requirements одновременно `derive_from` соответствующий legacy compound Requirement. Пока candidate не принят, он **не supersedes** accepted legacy Requirement.

## 5. verified_by

`verified_by` означает доказательство **всего** атомарного normative утверждения в указанном scope. Нельзя использовать его как «этот тест касается темы». Если тест доказывает только MemoryProvider, он не является доказательством универсального утверждения о любом provider. Planned Cxx и документация остаются documents, а не behavioral evidence.

## 6. Glossary

Термины с риском неоднозначности определены в [GLOSSARY.md](GLOSSARY.md). Новая формулировка должна использовать канонический смысл терминов, а не локальные синонимы.

## 7. Независимый Wiegers-check

Перед acceptance аудит каждого атомарного Requirement проверяет:
- complete в собственном scope;
- correct/source-backed;
- feasible;
- necessary;
- prioritized;
- unambiguous;
- verifiable.

Для набора дополнительно:
- complete относительно заявленного slice;
- consistent;
- modifiable;
- traceable вверх и вниз.

Аудитор должен отдельно отметить, где Requirement пока не имеет executable verification: это gap, а не автоматический BLOCK, если функция ещё planned.

## 8. Acceptance / migration

Этот Draft **не меняет authority** старого baseline. После независимого read-only аудита и явного авторского решения отдельным точным изменением:
1. соответствующие atomics получают `accepted=true,current=true`;
2. legacy compound IDs, которые полностью покрыты mapping, получают `current=false`;
3. только тогда добавляется `supersedes` от новых требований к legacy;
4. проверяется отсутствие потери normative semantics по `legacy-to-atomic.json`.

Нельзя выводить acceptance из CI/merge.
