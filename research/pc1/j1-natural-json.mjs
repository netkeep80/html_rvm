import {
  Index,
  Key,
  N,
  P,
  cloneJSON,
  executeMOAtomically,
  sameEndpoint
} from "../../src/mo-core.js";
import {
  SequentialMOAllocator,
  embedPlainJSON,
  projectPlainJSON
} from "../../src/mo-json.js";
import {
  Q,
  createDuplet,
  createE1State,
  createFrame,
  frameRoleSlot,
  frameRoleValue,
  serializeE1State,
  validateE1State
} from "./e1-witness.mjs";

const ROLE_KEYS = Object.freeze({ O: "$obj", R: "$rel", S: "$sub" });
const ROLE_BITS = Object.freeze({ O: 4, R: 2, S: 1 });
const ROOT_SOURCE_SLOT = "j1:source-root";
const PRIMITIVE_OUTPUT_ROLE = Object.freeze({
  "rmvm/version": "R",
  "json/meta": "R",
  "where": "R",
  "is_string": "S",
  "is_null": "S"
});

class J1Reject extends Error {
  constructor(diagnostic, message = diagnostic) {
    super(message);
    this.name = "J1Reject";
    this.diagnostic = diagnostic;
  }
}

function reject(diagnostic, message) {
  throw new J1Reject(diagnostic, message);
}

function programWithState(program, state) {
  return { ...program, state };
}

function freshId(set, prefix) {
  let i = 1;
  while (set.has(`${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
}

function freshNodeId(state) {
  return freshId(state.mo.used.N, "j1:N:");
}

function freshRelationId(state) {
  return freshId(state.mo.used.P, "j1:P:");
}

function freshFrameId(state) {
  return freshId(state.usedFrames, "j1:F:");
}

function applyMO(state, actions) {
  const result = executeMOAtomically(state.mo, actions);
  if (result.outcome.status !== "OK") reject(result.outcome.diagnostic ?? "J1_MO_REJECT");
  const next = { ...state, mo: result.state };
  validateE1State(next);
  return next;
}

function jsonNodeAction(id, value) {
  if (value === null) return { op: "createNode", id, kind: "null", payload: null };
  if (typeof value === "boolean") return { op: "createNode", id, kind: "boolean", payload: value };
  if (typeof value === "number" && Number.isFinite(value)) return { op: "createNode", id, kind: "number", payload: value };
  if (typeof value === "string") return { op: "createNode", id, kind: "string", payload: value };
  if (Array.isArray(value)) return { op: "createNode", id, kind: "array" };
  if (value && typeof value === "object" &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return { op: "createNode", id, kind: "object" };
  }
  reject("INVALID_JSON_VALUE");
}

function planJSONSubtree(state, input) {
  const value = cloneJSON(input);
  const usedN = new Set(state.mo.used.N);
  const usedP = new Set(state.mo.used.P);
  let ni = 1;
  let pi = 1;
  const actions = [];

  function nextN() {
    while (usedN.has(`j1:N:${ni}`)) ni += 1;
    const id = `j1:N:${ni++}`;
    usedN.add(id);
    return id;
  }

  function nextP() {
    while (usedP.has(`j1:P:${pi}`)) pi += 1;
    const id = `j1:P:${pi++}`;
    usedP.add(id);
    return id;
  }

  function build(current) {
    const nodeId = nextN();
    actions.push(jsonNodeAction(nodeId, current));
    if (Array.isArray(current)) {
      current.forEach((child, index) => {
        const childId = build(child);
        actions.push({
          op: "createRelation",
          id: nextP(),
          owner: N(nodeId),
          label: Index(index),
          target: N(childId)
        });
      });
    } else if (current && typeof current === "object") {
      for (const key of Object.keys(current).sort()) {
        const childId = build(current[key]);
        actions.push({
          op: "createRelation",
          id: nextP(),
          owner: N(nodeId),
          label: Key(key),
          target: N(childId)
        });
      }
    }
    return nodeId;
  }

  const rootId = build(value);
  return { actions, root: N(rootId) };
}

function appendJSON(program, value) {
  const plan = planJSONSubtree(program.state, value);
  const state = applyMO(program.state, plan.actions);
  return { program: programWithState(program, state), endpoint: plan.root };
}

function appendArrayByReference(program, endpoints) {
  for (const endpoint of endpoints) {
    if (endpoint?.sort !== "N" || !program.state.mo.nodes.has(endpoint.id)) reject("WHERE_ITEM_NOT_JSON_NODE");
  }
  let state = program.state;
  const nodeId = freshNodeId(state);
  state = applyMO(state, [{ op: "createNode", id: nodeId, kind: "array" }]);
  for (let i = 0; i < endpoints.length; i += 1) {
    const relationId = freshRelationId(state);
    state = applyMO(state, [{
      op: "createRelation",
      id: relationId,
      owner: N(nodeId),
      label: Index(i),
      target: endpoints[i]
    }]);
  }
  return { program: programWithState(program, state), endpoint: N(nodeId) };
}

function createMemberSlot(program, owner, key, initial) {
  if (owner?.sort !== "N" || !program.state.mo.nodes.has(owner.id)) reject("INVALID_MEMBER_OWNER");
  const id = freshRelationId(program.state);
  const state = applyMO(program.state, [{
    op: "createRelation",
    id,
    owner,
    label: Key(key),
    target: initial
  }]);
  return { program: programWithState(program, state), slot: P(id) };
}

function createRuntimeSlot(program, initial) {
  const id = freshRelationId(program.state);
  const begin = program.state.mo.roots[0];
  const created = createDuplet(program.state, { id, begin, end: initial });
  if (created.outcome.status !== "OK") reject(created.outcome.diagnostic ?? "RUNTIME_SLOT_CREATE");
  return { program: programWithState(program, created.state), slot: P(id) };
}

function structuralRelations(state, owner) {
  const result = [];
  for (const [id, relation] of state.mo.relations) {
    if (!sameEndpoint(relation.owner, owner)) continue;
    if (relation.label.kind === "key" || relation.label.kind === "index") result.push([id, relation]);
  }
  return result;
}

function objectMembers(state, node) {
  const record = state.mo.nodes.get(node.id);
  if (!record || record.kind !== "object") reject("ENTITY_OBJECT_REQUIRED");
  const map = new Map();
  for (const [id, relation] of structuralRelations(state, node)) {
    if (relation.label.kind !== "key") reject("ENTITY_OBJECT_KEY_REQUIRED");
    if (map.has(relation.label.value)) reject("DUPLICATE_SOURCE_KEY");
    map.set(relation.label.value, { id, relation });
  }
  return map;
}

function arrayMembers(state, node) {
  const record = state.mo.nodes.get(node.id);
  if (!record || record.kind !== "array") reject("ARRAY_REQUIRED");
  const items = structuralRelations(state, node)
    .filter(([, relation]) => relation.label.kind === "index")
    .sort((a, b) => a[1].label.value - b[1].label.value);
  if (items.some(([, relation], index) => relation.label.value !== index)) reject("SPARSE_ARRAY");
  return items;
}

function findSourceMember(state, owner, segment) {
  const expectedKind = typeof segment === "string" ? "key" : "index";
  const expectedValue = segment;
  const matches = structuralRelations(state, owner).filter(([, relation]) =>
    relation.label.kind === expectedKind && relation.label.value === expectedValue);
  if (matches.length !== 1) reject(matches.length ? "AMBIGUOUS_SOURCE_PATH" : "SOURCE_PATH_NOT_FOUND");
  const [id, relation] = matches[0];
  if (!relation.bound || relation.target.sort !== "N") reject("SOURCE_PATH_NOT_JSON");
  return { id, relation };
}

function resolveSourcePath(program, path = []) {
  if (!Array.isArray(path)) reject("SOURCE_PATH_INVALID");
  let node = program.state.mo.roots[0];
  let incoming = P(ROOT_SOURCE_SLOT);
  for (const segment of path) {
    const record = program.state.mo.nodes.get(node.id);
    if (typeof segment === "string" && record?.kind !== "object") reject("SOURCE_PATH_TYPE");
    if (typeof segment === "number" && record?.kind !== "array") reject("SOURCE_PATH_TYPE");
    const member = findSourceMember(program.state, node, segment);
    incoming = P(member.id);
    node = member.relation.target;
  }
  return { node, incoming };
}

function inspectResolvedEntity(program, resolved) {
  const members = objectMembers(program.state, resolved.node);
  let mask = 0;
  const explicit = { O: false, R: false, S: false };
  const sourceSlots = { O: null, R: null, S: null };
  for (const role of ["O", "R", "S"]) {
    const entry = members.get(ROLE_KEYS[role]);
    if (!entry) continue;
    explicit[role] = true;
    sourceSlots[role] = P(entry.id);
    mask |= ROLE_BITS[role];
  }
  const ordinaryKeys = [...members.keys()].filter(key => !Object.values(ROLE_KEYS).includes(key)).sort();
  let controller = null;
  if (explicit.R) {
    const endpoint = program.state.mo.relations.get(sourceSlots.R.id).target;
    const value = projectPlainJSON(program.state.mo, endpoint);
    if (typeof value !== "string") reject("CONTROLLER_NAME_REQUIRED");
    controller = value;
  }
  return {
    node: resolved.node,
    entitySlot: resolved.incoming,
    mask,
    explicit,
    sourceSlots,
    ordinaryKeys,
    controller
  };
}

function exactReference(program, endpoint) {
  const node = program.state.mo.nodes.get(endpoint.id);
  if (!node || node.kind !== "object") return null;
  const members = objectMembers(program.state, endpoint);
  if (!members.has("$ref")) return null;
  if (members.size !== 1) reject("UNSUPPORTED_REFERENCE");
  const relation = members.get("$ref").relation;
  if (!relation.bound || relation.target.sort !== "N") reject("UNSUPPORTED_REFERENCE");
  const value = projectPlainJSON(program.state.mo, relation.target);
  if (value !== "$obj") reject("UNSUPPORTED_REFERENCE");
  return "$obj";
}

function resolveExplicitTermSlot(program, sourceSlot, caller) {
  const relation = program.state.mo.relations.get(sourceSlot.id);
  if (!relation?.bound || relation.target.sort !== "N") reject("INVALID_SOURCE_ROLE");
  const ref = exactReference(program, relation.target);
  if (ref === "$obj") {
    if (!caller?.O) reject("MISSING_CALLER_OBJ");
    return caller.O;
  }
  return sourceSlot;
}

function instantiateResolvedEntity(program, resolved, caller) {
  const info = inspectResolvedEntity(program, resolved);
  if (!caller?.R) reject("MISSING_CONTEXT_R");
  const O = info.explicit.O ? resolveExplicitTermSlot(program, info.sourceSlots.O, caller) : caller.R;
  const R = caller.R;
  const S = info.explicit.S ? resolveExplicitTermSlot(program, info.sourceSlots.S, caller) : caller.R;
  const id = freshFrameId(program.state);
  const created = createFrame(program.state, {
    id,
    parent: caller.frame ?? null,
    E: resolved.incoming.id,
    O: O.id,
    R: R.id,
    S: S.id
  });
  if (created.outcome.status !== "OK") reject(created.outcome.diagnostic ?? "FRAME_CREATE_FAILED");
  const next = programWithState(program, created.state);
  return {
    program: next,
    frame: id,
    mask: info.mask,
    controller: info.controller,
    explicit: info.explicit,
    sourceSlots: info.sourceSlots,
    ordinaryKeys: info.ordinaryKeys,
    runtimeSlots: {
      E: P(resolved.incoming.id),
      O: frameRoleSlot(next.state, id, "O"),
      R: frameRoleSlot(next.state, id, "R"),
      S: frameRoleSlot(next.state, id, "S")
    }
  };
}

function writeFrameRole(program, frame, role, target) {
  const result = Q(program.state, {
    frame,
    steps: [{ op: "rebindRole", role, target }]
  });
  if (result.outcome.status !== "OK") reject(result.outcome.diagnostic ?? "ROLE_WRITE_FAILED");
  return { program: programWithState(program, result.state), trace: result.trace };
}

function slotTarget(program, slot) {
  const relation = program.state.mo.relations.get(slot.id);
  if (!relation?.bound) reject("UNBOUND_RUNTIME_SLOT");
  return relation.target;
}

function frameEndpoint(program, frame, role) {
  return frameRoleValue(program.state, frame, role);
}

function resultEvent(program, inst, controller, outputRole, target, options = {}) {
  return {
    controller,
    frame: inst.frame,
    iteration: options.iteration ?? null,
    outputRole,
    sourceControllerSlot: inst.sourceSlots?.R?.id ?? null,
    runtimeRSlot: frameRoleSlot(program.state, inst.frame, "R").id,
    result: projectPlainJSON(program.state.mo, target)
  };
}

function requireEnvironment(environment) {
  if (!environment || typeof environment.version !== "string" || !Object.hasOwn(environment, "meta")) {
    reject("ENVIRONMENT_REQUIRED");
  }
  return environment;
}

function* invokePrimitive(program, inst, environment, events, options = {}) {
  const controller = inst.controller;
  if (!Object.hasOwn(PRIMITIVE_OUTPUT_ROLE, controller)) reject("UNKNOWN_CONTROLLER");
  environment = requireEnvironment(environment);

  if (controller === "rmvm/version") {
    const appended = appendJSON(program, environment.version);
    const written = writeFrameRole(appended.program, inst.frame, "R", appended.endpoint);
    events.push(resultEvent(written.program, inst, controller, "R", appended.endpoint, options));
    yield { program: written.program, event: events.at(-1) };
    return { program: written.program, endpoint: appended.endpoint };
  }

  if (controller === "json/meta") {
    const appended = appendJSON(program, environment.meta);
    const written = writeFrameRole(appended.program, inst.frame, "R", appended.endpoint);
    events.push(resultEvent(written.program, inst, controller, "R", appended.endpoint, options));
    yield { program: written.program, event: events.at(-1) };
    return { program: written.program, endpoint: appended.endpoint };
  }

  if (controller === "is_string" || controller === "is_null") {
    const input = frameEndpoint(program, inst.frame, "O");
    const value = projectPlainJSON(program.state.mo, input);
    const boolean = controller === "is_string" ? typeof value === "string" : value === null;
    const appended = appendJSON(program, boolean);
    const written = writeFrameRole(appended.program, inst.frame, "S", appended.endpoint);
    events.push(resultEvent(written.program, inst, controller, "S", appended.endpoint, options));
    yield { program: written.program, event: events.at(-1) };
    return { program: written.program, endpoint: appended.endpoint };
  }

  if (controller === "where") {
    const input = frameEndpoint(program, inst.frame, "O");
    const inputNode = program.state.mo.nodes.get(input.id);
    if (!inputNode) reject("WHERE_INPUT_MISSING");
    if (!inst.explicit.S) reject("WHERE_PREDICATE_REQUIRED");
    const predicateSlot = frameRoleSlot(program.state, inst.frame, "S");
    const predicate = slotTarget(program, predicateSlot);
    if (predicate.sort !== "N" || program.state.mo.nodes.get(predicate.id)?.kind !== "object") {
      reject("WHERE_PREDICATE_REQUIRED");
    }

    let current = program;
    const selected = [];
    if (inputNode.kind === "null") {
      // Historical bounded behavior: null filters to an empty array.
    } else if (inputNode.kind === "array") {
      const items = arrayMembers(program.state, input);
      for (let index = 0; index < items.length; index += 1) {
        const [itemSlotId, itemRelation] = items[index];
        const nullResult = appendJSON(current, null);
        current = nullResult.program;
        const boolSlot = createRuntimeSlot(current, nullResult.endpoint);
        current = boolSlot.program;

        const childResolved = { node: predicate, incoming: predicateSlot };
        const child = instantiateResolvedEntity(current, childResolved, {
          frame: inst.frame,
          O: P(itemSlotId),
          R: boolSlot.slot
        });
        current = child.program;
        if (!child.controller) reject("WHERE_PREDICATE_CONTROLLER_REQUIRED");
        const invoked = yield* invokePrimitive(current, child, environment, events, { iteration: index });
        current = invoked.program;
        const boolValue = projectPlainJSON(current.state.mo, slotTarget(current, boolSlot.slot));
        if (boolValue === true) selected.push(itemRelation.target);
      }
    } else {
      reject("WHERE_ARRAY_REQUIRED");
    }

    const output = appendArrayByReference(current, selected);
    const written = writeFrameRole(output.program, inst.frame, "R", output.endpoint);
    events.push(resultEvent(written.program, inst, controller, "R", output.endpoint, options));
    yield { program: written.program, event: events.at(-1) };
    return { program: written.program, endpoint: output.endpoint };
  }

  reject("UNKNOWN_CONTROLLER");
}

function isBoundedLambdaObject(program, node) {
  const record = program.state.mo.nodes.get(node.id);
  if (!record || record.kind !== "object") return false;
  const members = objectMembers(program.state, node);
  if (members.size === 0) return false;
  if ([...members.keys()].some(key => Object.values(ROLE_KEYS).includes(key))) return false;
  for (const [key, entry] of members) {
    if (!key.startsWith("$rel/") || key.length <= "$rel/".length || key.slice("$rel/".length).includes("/")) return false;
    const value = projectPlainJSON(program.state.mo, entry.relation.target);
    if (typeof value !== "string") return false;
  }
  return true;
}

function* invokeLambdaObject(program, resolved, caller, environment, events) {
  const lambda = instantiateResolvedEntity(program, resolved, caller);
  let current = lambda.program;

  const output = appendJSON(current, {});
  current = output.program;
  const rootWrite = writeFrameRole(current, lambda.frame, "R", output.endpoint);
  current = rootWrite.program;

  const members = [...objectMembers(current.state, resolved.node)]
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [sourceKey, entry] of members) {
    const outputKey = sourceKey.slice("$rel/".length);
    const initial = appendJSON(current, null);
    current = initial.program;
    const destination = createMemberSlot(current, output.endpoint, outputKey, initial.endpoint);
    current = destination.program;

    const controller = projectPlainJSON(current.state.mo, entry.relation.target);
    if (typeof controller !== "string") reject("CONTROLLER_NAME_REQUIRED");
    const frameId = freshFrameId(current.state);
    const created = createFrame(current.state, {
      id: frameId,
      parent: lambda.frame,
      E: entry.id,
      O: destination.slot.id,
      R: destination.slot.id,
      S: destination.slot.id
    });
    if (created.outcome.status !== "OK") reject(created.outcome.diagnostic ?? "FRAME_CREATE_FAILED");
    current = programWithState(current, created.state);
    const inst = {
      program: current,
      frame: frameId,
      mask: 2,
      controller,
      explicit: { O: false, R: true, S: false },
      sourceSlots: { O: null, R: P(entry.id), S: null },
      ordinaryKeys: [],
      runtimeSlots: {
        E: P(entry.id),
        O: destination.slot,
        R: destination.slot,
        S: destination.slot
      }
    };
    const invoked = yield* invokePrimitive(current, inst, environment, events);
    current = invoked.program;
  }
  return { program: current, endpoint: output.endpoint };
}

function* executeBody(program, environment, events) {
  const root = program.state.mo.roots[0];
  const node = program.state.mo.nodes.get(root.id);
  if (!node) reject("SOURCE_ROOT_MISSING");

  if (node.kind !== "object") {
    return { program, endpoint: root, mode: "DATA" };
  }

  const resolved = { node: root, incoming: P(ROOT_SOURCE_SLOT) };
  const info = inspectResolvedEntity(program, resolved);

  const initial = appendJSON(program, null);
  let current = initial.program;
  const context = createRuntimeSlot(current, initial.endpoint);
  current = context.program;
  const caller = { frame: null, O: context.slot, R: context.slot };

  if (info.mask !== 0) {
    const inst = instantiateResolvedEntity(current, resolved, caller);
    current = inst.program;
    if (!inst.controller) reject("NO_CONTROLLER");
    const invoked = yield* invokePrimitive(current, inst, environment, events);
    current = invoked.program;
    return { program: current, endpoint: slotTarget(current, context.slot), mode: "CALL" };
  }

  if (isBoundedLambdaObject(current, root)) {
    const invoked = yield* invokeLambdaObject(current, resolved, caller, environment, events);
    current = invoked.program;
    return { program: current, endpoint: slotTarget(current, context.slot), mode: "LAMBDA" };
  }

  return { program, endpoint: root, mode: "DATA" };
}

export function subjectivateNaturalJSON(source) {
  const embedded = embedPlainJSON(source, {
    allocator: new SequentialMOAllocator({
      nodePrefix: "j1srcN:",
      relationPrefix: "j1srcP:"
    })
  });
  let state = createE1State(embedded.state);
  const rootSlot = createDuplet(state, {
    id: ROOT_SOURCE_SLOT,
    begin: embedded.root,
    end: embedded.root
  });
  if (rootSlot.outcome.status !== "OK") reject(rootSlot.outcome.diagnostic ?? "SOURCE_ROOT_SLOT");
  state = rootSlot.state;
  return {
    state,
    sourceRoot: embedded.root,
    subjectivationTrace: embedded.trace
  };
}

export function objectivateNaturalJSON(program) {
  validateE1State(program.state);
  return projectPlainJSON(program.state.mo, program.state.mo.roots[0]);
}

export function inspectNaturalEntity(program, path = []) {
  validateE1State(program.state);
  const resolved = resolveSourcePath(program, path);
  return inspectResolvedEntity(program, resolved);
}

export function instantiateNaturalEntity(program, path = []) {
  validateE1State(program.state);
  const resolved = resolveSourcePath(program, path);
  const initial = appendJSON(program, null);
  const context = createRuntimeSlot(initial.program, initial.endpoint);
  const inst = instantiateResolvedEntity(context.program, resolved, {
    frame: null,
    O: context.slot,
    R: context.slot
  });
  return {
    ...inst,
    contextSlot: context.slot
  };
}

export function* stepNaturalJSON(program, environment) {
  validateE1State(program.state);
  const start = program;
  const events = [];
  try {
    const executed = yield* executeBody(program, environment, events);
    return {
      program: executed.program,
      result: projectPlainJSON(executed.program.state.mo, executed.endpoint),
      resultEndpoint: executed.endpoint,
      events,
      mode: executed.mode,
      diagnostic: null
    };
  } catch (error) {
    const diagnostic = error?.diagnostic;
    if (!diagnostic) throw error;
    return {
      program: start,
      result: null,
      resultEndpoint: null,
      events: [],
      mode: "REJECT",
      diagnostic
    };
  }
}

// Run and Step share the same execution path and whole-attempt rejection contract.
export function executeNaturalJSON(program, environment) {
  const execution = stepNaturalJSON(program, environment);
  let next;
  do { next = execution.next(); } while (!next.done);
  return next.value;
}

export function reflectiveReplaceRole(program, path, role, value) {
  validateE1State(program.state);
  if (!Object.hasOwn(ROLE_KEYS, role)) reject("INVALID_REFLECTIVE_ROLE");
  const resolved = resolveSourcePath(program, path);
  const info = inspectResolvedEntity(program, resolved);
  const sourceSlot = info.sourceSlots[role];
  if (!sourceSlot) reject("ROLE_NOT_EXPLICIT");

  const appended = appendJSON(program, value);
  let current = appended.program;
  const nullValue = appendJSON(current, null);
  current = nullValue.program;
  const context = createRuntimeSlot(current, nullValue.endpoint);
  current = context.program;

  const roles = {
    E: resolved.incoming.id,
    O: context.slot.id,
    R: context.slot.id,
    S: context.slot.id
  };
  roles[role] = sourceSlot.id;

  const frame = freshFrameId(current.state);
  const created = createFrame(current.state, {
    id: frame,
    parent: null,
    E: roles.E,
    O: roles.O,
    R: roles.R,
    S: roles.S
  });
  if (created.outcome.status !== "OK") reject(created.outcome.diagnostic ?? "REFLECTIVE_FRAME_CREATE");
  current = programWithState(current, created.state);

  const edited = Q(current.state, {
    frame,
    steps: [{ op: "rebindRole", role, target: appended.endpoint }]
  });
  if (edited.outcome.status !== "OK") reject(edited.outcome.diagnostic ?? "REFLECTIVE_EDIT_FAILED");
  current = programWithState(current, edited.state);

  return {
    program: current,
    frame,
    sourceSlot,
    newTarget: appended.endpoint,
    trace: edited.trace
  };
}

export function sourceSnapshot(program) {
  return {
    json: objectivateNaturalJSON(program),
    state: serializeE1State(program.state)
  };
}

export { J1Reject, PRIMITIVE_OUTPUT_ROLE };
