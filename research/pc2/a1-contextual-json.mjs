import {
  Index,
  Key,
  N,
  P,
  cloneJSON,
  executeMO,
  executeMOAtomically,
  sameEndpoint
} from "../../src/mo-core.js";
import { projectPlainJSON } from "../../src/mo-json.js";
import {
  createDuplet,
  createFrame,
  deserializeE1State,
  frameRoleSlot,
  serializeE1State,
  validateE1State
} from "../pc1/e1-witness.mjs";
import { subjectivateNaturalJSON } from "../pc1/j1-natural-json.mjs";

export const PC2_A1_ROOT_SOURCE_SLOT = "j1:source-root";
const ROLE_KEY = Object.freeze({ O: "$obj", R: "$rel", S: "$sub" });
const ROLE_NAME = Object.freeze({ ent: "E", obj: "O", rel: "R", sub: "S" });
const A1_ADMITTED_PRIMITIVES = new Set(["=", "add_entity"]);
const A2_ADMITTED_PRIMITIVES = new Set([
  "=", "add_entity", "is_string", "is_null", "where", "foreachobj", "ALIAS", "VIEW"
]);
const DEFAULT_EXECUTION_FUEL = 512;
const EXEC_PROFILE_A1 = "A1";
const EXEC_PROFILE_A2 = "A2_EXEC";

export class PC2A1Reject extends Error {
  constructor(diagnostic, message = diagnostic) {
    super(message);
    this.name = "PC2A1Reject";
    this.diagnostic = diagnostic;
  }
}

function reject(diagnostic, message) {
  throw new PC2A1Reject(diagnostic, message);
}

function endpointCopy(endpoint) {
  return endpoint.sort === "N" ? N(endpoint.id) : P(endpoint.id);
}

function sortedObjectEntries(object) {
  return Object.keys(object).sort().map(key => [key, object[key]]);
}

function mapJSON(map) {
  return [...map.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => [key, cloneJSON(value)]);
}

function cloneSession(session) {
  return {
    state: deserializeE1State(serializeE1State(session.state)),
    sourceRoot: endpointCopy(session.sourceRoot),
    registry: new Map(mapJSON(session.registry)),
    namespace: new Map([...session.namespace.entries()]),
    allocator: { ...session.allocator },
    host: { ...session.host }
  };
}

function committedSession(tx) {
  return {
    state: tx.state,
    sourceRoot: endpointCopy(tx.sourceRoot),
    registry: new Map(mapJSON(tx.registry)),
    namespace: new Map([...tx.namespace.entries()]),
    allocator: { ...tx.allocator },
    host: { ...tx.host }
  };
}

function cloneCapability(capability) {
  if (!capability) return null;
  return {
    ...capability,
    ownedP: new Set(capability.ownedP ?? []),
    ownedN: new Set(capability.ownedN ?? []),
    forbiddenReadP: new Set(capability.forbiddenReadP ?? []),
    forbiddenReadN: new Set(capability.forbiddenReadN ?? [])
  };
}

function beginTransaction(session, { profile = EXEC_PROFILE_A1 } = {}) {
  const tx = {
    ...cloneSession(session),
    attemptedTrace: [],
    readDependencies: [],
    profile,
    capability: null
  };
  if (profile === EXEC_PROFILE_A2) tx.executionBudget = { remaining: DEFAULT_EXECUTION_FUEL };
  else tx.executionFuel = DEFAULT_EXECUTION_FUEL;
  return tx;
}

function beginProbeTransaction(tx) {
  const probe = {
    ...cloneSession(tx),
    attemptedTrace: [],
    readDependencies: [],
    profile: tx.profile ?? EXEC_PROFILE_A1,
    capability: cloneCapability(tx.capability)
  };
  if (tx.executionBudget) probe.executionBudget = tx.executionBudget;
  else probe.executionFuel = tx.executionFuel;
  return probe;
}

function record(tx, event) {
  tx.attemptedTrace.push(cloneJSON(event));
}

function requireRelation(state, slot) {
  if (!slot || slot.sort !== "P") reject("INVALID_SLOT");
  const relation = state.mo.relations.get(slot.id);
  if (!relation) reject("MISSING_SLOT");
  if (!relation.bound) reject("UNBOUND_SLOT");
  return relation;
}

// Semantic reads, not implementation-wide validation scans. Keep this ledger
// separate from committed/attempted operation traces and from the persistent state.
function observeReads(tx, ids) {
  for (const id of ids) tx.readDependencies.push(id);
}

function guardCapabilityRead(context, slot, relation) {
  if (!context.capability) return;
  if (context.capability.forbiddenReadP?.has(slot.id)) reject("ITERATOR_UNPROVEN_EFFECT");
  if (relation.target.sort === "N" && context.capability.forbiddenReadN?.has(relation.target.id)) {
    reject("ITERATOR_UNPROVEN_EFFECT");
  }
}

function readRelation(tx, slot) {
  const relation = requireRelation(tx.state, slot);
  guardCapabilityRead(tx, slot, relation);
  observeReads(tx, [slot.id]);
  return relation;
}

// Use the existing JSON projector as the sole value authority. On success,
// collect every structural P traversed by that projection, by identity.
// Rebinding any such P may change the projected value. Shared N descendants
// are visited once for the footprint (the projector retains its own semantics).
function projectValue(tx, endpoint) {
  const value = projectPlainJSON(tx.state.mo, endpoint);
  const outgoing = new Map();
  for (const [id, relation] of tx.state.mo.relations) {
    if (relation.owner.sort !== "N" ||
        (relation.label.kind !== "key" && relation.label.kind !== "index")) continue;
    const key = relation.owner.id;
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key).push([id, relation]);
  }
  const pending = [endpoint.id];
  const seen = new Set();
  while (pending.length) {
    const node = pending.pop();
    if (seen.has(node)) continue;
    seen.add(node);
    for (const [id, relation] of outgoing.get(node) ?? []) {
      observeReads(tx, [id]);
      // A successful projection already established bound N targets.
      pending.push(relation.target.id);
    }
  }
  return value;
}

function frameRecord(state, frameId) {
  const frame = state.frames.get(frameId);
  if (!frame) reject("MISSING_FRAME");
  return frame;
}

function canonicalSourceRootFromState(state) {
  if (!Array.isArray(state.mo.roots) || state.mo.roots.length < 1) reject("SOURCE_ROOT_MISSING");
  const root = state.mo.roots[0];
  const anchor = state.mo.relations.get(PC2_A1_ROOT_SOURCE_SLOT);
  if (!anchor || !anchor.bound || !sameEndpoint(anchor.target, root)) reject("SOURCE_ROOT_INCOHERENT");
  return endpointCopy(root);
}

function assertCanonicalSourceRoot(txOrSession) {
  const root = canonicalSourceRootFromState(txOrSession.state);
  if (!sameEndpoint(root, txOrSession.sourceRoot)) reject("SOURCE_ROOT_INCOHERENT");
  return root;
}

function freshNode(tx) {
  while (tx.state.mo.used.N.has(`pc2:N:${tx.allocator.N}`)) tx.allocator.N += 1;
  return `pc2:N:${tx.allocator.N++}`;
}

function freshRelation(tx) {
  while (tx.state.mo.used.P.has(`pc2:P:${tx.allocator.P}`)) tx.allocator.P += 1;
  return `pc2:P:${tx.allocator.P++}`;
}

function freshFrame(tx) {
  while (tx.state.usedFrames.has(`pc2:F:${tx.allocator.F}`)) tx.allocator.F += 1;
  return `pc2:F:${tx.allocator.F++}`;
}

function nodeAction(id, value) {
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

function capabilityShadow(tx) {
  if (!tx.capability) return null;
  return {
    ownedP: new Set(tx.capability.ownedP),
    ownedN: new Set(tx.capability.ownedN)
  };
}

function authorizeCapabilityAction(tx, action, shadow) {
  if (!tx.capability) return;
  if (action.op === "createNode") {
    shadow.ownedN.add(action.id);
    return;
  }
  if (action.op === "createRelation") {
    const ownerAllowed = action.owner?.sort === "N"
      ? shadow.ownedN.has(action.owner.id)
      : action.owner?.sort === "P" && shadow.ownedP.has(action.owner.id);
    if (!ownerAllowed) reject("ITERATOR_FOREIGN_WRITE");
    shadow.ownedP.add(action.id);
    return;
  }
  if (action.op === "rebindRelation" || action.op === "unbindRelation" || action.op === "deleteRelation") {
    if (!shadow.ownedP.has(action.id)) reject("ITERATOR_FOREIGN_WRITE");
    return;
  }
  reject("ITERATOR_UNPROVEN_EFFECT");
}

function commitCapabilityShadow(tx, shadow) {
  if (!tx.capability || !shadow) return;
  tx.capability.ownedP = shadow.ownedP;
  tx.capability.ownedN = shadow.ownedN;
}

function applyAtomicMO(tx, actions, kind) {
  const shadow = capabilityShadow(tx);
  if (shadow) for (const action of actions) authorizeCapabilityAction(tx, action, shadow);
  const result = executeMOAtomically(tx.state.mo, actions);
  record(tx, { op: kind, actions: actions.map(action => ({ ...action })), status: result.outcome.status, diagnostic: result.outcome.diagnostic });
  if (result.outcome.status !== "OK") reject(result.outcome.diagnostic ?? "MO_REJECT");
  tx.state = { ...tx.state, mo: result.state };
  commitCapabilityShadow(tx, shadow);
  validateE1State(tx.state);
  assertCanonicalSourceRoot(tx);
  return result;
}

function applyOneMO(tx, action, kind) {
  const shadow = capabilityShadow(tx);
  if (shadow) authorizeCapabilityAction(tx, action, shadow);
  const result = executeMO(tx.state.mo, action);
  record(tx, { op: kind, action: { ...action }, status: result.outcome.status, diagnostic: result.outcome.diagnostic });
  if (result.outcome.status !== "OK") reject(result.outcome.diagnostic ?? "MO_REJECT");
  tx.state = { ...tx.state, mo: result.state };
  commitCapabilityShadow(tx, shadow);
  validateE1State(tx.state);
  assertCanonicalSourceRoot(tx);
  return result;
}

function planJSONSubtree(tx, input) {
  const value = cloneJSON(input);
  const actions = [];
  function build(current) {
    const id = freshNode(tx);
    actions.push(nodeAction(id, current));
    if (Array.isArray(current)) {
      current.forEach((child, index) => {
        const childId = build(child);
        actions.push({ op: "createRelation", id: freshRelation(tx), owner: N(id), label: Index(index), target: N(childId) });
      });
    } else if (current && typeof current === "object") {
      for (const [key, child] of sortedObjectEntries(current)) {
        const childId = build(child);
        actions.push({ op: "createRelation", id: freshRelation(tx), owner: N(id), label: Key(key), target: N(childId) });
      }
    }
    return id;
  }
  const rootId = build(value);
  return { actions, root: N(rootId) };
}

function appendJSON(tx, value, label = "append-json") {
  const plan = planJSONSubtree(tx, value);
  applyAtomicMO(tx, plan.actions, label);
  return plan.root;
}

function createRuntimeSlot(tx, initial, kind = "runtime-slot") {
  if (tx.capability) reject("ITERATOR_UNPROVEN_EFFECT");
  const id = freshRelation(tx);
  const created = createDuplet(tx.state, { id, begin: canonicalSourceRootFromState(tx.state), end: initial });
  record(tx, { op: kind, id, status: created.outcome.status, diagnostic: created.outcome.diagnostic });
  if (created.outcome.status !== "OK") reject(created.outcome.diagnostic ?? "RUNTIME_SLOT_CREATE");
  tx.state = created.state;
  assertCanonicalSourceRoot(tx);
  return P(id);
}

function createFrameTx(tx, roles, parent, kind) {
  const id = freshFrame(tx);
  const created = createFrame(tx.state, { id, parent, ...roles });
  record(tx, { op: kind, id, parent, roles: { ...roles }, status: created.outcome.status, diagnostic: created.outcome.diagnostic });
  if (created.outcome.status !== "OK") reject(created.outcome.diagnostic ?? "FRAME_CREATE_FAILED");
  tx.state = created.state;
  assertCanonicalSourceRoot(tx);
  return id;
}

function structuralRelations(state, owner) {
  const out = [];
  for (const [id, relation] of state.mo.relations) {
    if (!sameEndpoint(relation.owner, owner)) continue;
    if (relation.label.kind === "key" || relation.label.kind === "index") out.push([id, relation]);
  }
  return out;
}

function objectMembers(tx, slot) {
  const state = tx.state;
  const relation = readRelation(tx, slot);
  if (relation.target.sort !== "N") reject("ENTITY_OBJECT_REQUIRED");
  const node = state.mo.nodes.get(relation.target.id);
  if (!node || node.kind !== "object") reject("ENTITY_OBJECT_REQUIRED");
  const members = new Map();
  for (const [id, member] of structuralRelations(state, relation.target)) {
    if (member.label.kind !== "key") reject("ENTITY_OBJECT_KEY_REQUIRED");
    if (members.has(member.label.value)) reject("DUPLICATE_SOURCE_KEY");
    members.set(member.label.value, P(id));
  }
  return { node: relation.target, members };
}

function arrayMembers(state, endpoint) {
  if (endpoint.sort !== "N") reject("ARRAY_REQUIRED");
  const node = state.mo.nodes.get(endpoint.id);
  if (!node || node.kind !== "array") reject("ARRAY_REQUIRED");
  const entries = structuralRelations(state, endpoint)
    .filter(([, relation]) => relation.label.kind === "index")
    .sort((a, b) => a[1].label.value - b[1].label.value);
  if (entries.some(([, relation], index) => relation.label.value !== index)) reject("SPARSE_ARRAY");
  return entries.map(([id]) => P(id));
}

function decodePointerToken(token) {
  if (/~(?:[^01]|$)/.test(token)) reject("INVALID_CONTEXT_PATH");
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function parseAddress(address) {
  if (typeof address !== "string" || address.length === 0) reject("INVALID_CONTEXT_PATH");
  const slash = address.indexOf("/");
  const rootToken = slash < 0 ? address : address.slice(0, slash);
  const tail = slash < 0 ? [] : address.slice(slash + 1).split("/").map(decodePointerToken);
  const pronoun = /^(\$+)(ent|obj|rel|sub)$/.exec(rootToken);
  if (pronoun) {
    return { kind: "context", depth: pronoun[1].length - 1, role: ROLE_NAME[pronoun[2]], rootToken, segments: tail };
  }
  if (rootToken.startsWith("$")) reject("INVALID_CONTEXT_ROOT");
  if (!rootToken) reject("INVALID_CONTEXT_ROOT");
  return { kind: "global", name: rootToken, rootToken, segments: tail };
}

function rootSlotForParsed(context, frameId, parsed) {
  let slot;
  if (parsed.kind === "global") {
    const id = context.namespace.get(parsed.name);
    if (!id) reject("GLOBAL_NOT_LOADED");
    slot = P(id);
  } else {
    let frame = frameRecord(context.state, frameId);
    for (let i = 0; i < parsed.depth; i += 1) {
      if (frame.parent === null) reject("MISSING_PARENT_CONTEXT");
      frame = frameRecord(context.state, frame.parent);
    }
    slot = P(frame.roles[parsed.role]);
  }
  const relation = requireRelation(context.state, slot);
  guardCapabilityRead(context, slot, relation);
  return slot;
}

function labelForOwner(state, owner, segment) {
  if (owner.sort === "N") {
    const node = state.mo.nodes.get(owner.id);
    if (node?.kind === "array") {
      if (!/^(0|[1-9][0-9]*)$/.test(segment)) reject("INVALID_ARRAY_INDEX");
      const index = Number(segment);
      if (!Number.isSafeInteger(index)) reject("INVALID_ARRAY_INDEX");
      return Index(index);
    }
  }
  return Key(segment);
}

function matchingMemberRelations(state, owner, label) {
  return [...state.mo.relations.entries()].filter(([, relation]) =>
    sameEndpoint(relation.owner, owner) &&
    relation.label.kind === label.kind &&
    relation.label.value === label.value);
}

function resolveParsedExisting(context, frameId, parsed) {
  let slot = rootSlotForParsed(context, frameId, parsed);
  const readSlots = [slot.id];
  for (const segment of parsed.segments) {
    const relation = requireRelation(context.state, slot);
    const owner = endpointCopy(relation.target);
    const label = labelForOwner(context.state, owner, segment);
    const matches = matchingMemberRelations(context.state, owner, label);
    if (matches.length === 0) reject("MISSING_CONTEXT_PATH");
    if (matches.length !== 1) reject("AMBIGUOUS_CONTEXT_PATH");
    const [id, member] = matches[0];
    if (!member.bound) reject("UNBOUND_SLOT");
    slot = P(id);
    guardCapabilityRead(context, slot, member);
    readSlots.push(id);
  }
  return { slot, readSlots, parsed };
}

export function resolveExistingPC2A1(context, frameId, address) {
  return resolveParsedExisting(context, frameId, parseAddress(address));
}

function stageLoadNamespace(tx, name) {
  if (tx.namespace.has(name)) {
    record(tx, { op: "host.cache-hit", name, slot: tx.namespace.get(name) });
    return P(tx.namespace.get(name));
  }
  if (tx.capability) reject("ITERATOR_UNPROVEN_EFFECT");
  if (!tx.registry.has(name)) {
    record(tx, { op: "host.load", name, status: "REJECT", diagnostic: "GLOBAL_NOT_FOUND" });
    reject("GLOBAL_NOT_FOUND");
  }
  const endpoint = appendJSON(tx, tx.registry.get(name), `host-load:${name}:embed`);
  const id = freshRelation(tx);
  const created = createDuplet(tx.state, { id, begin: canonicalSourceRootFromState(tx.state), end: endpoint });
  record(tx, { op: "host.load", name, slot: id, status: created.outcome.status, diagnostic: created.outcome.diagnostic });
  if (created.outcome.status !== "OK") reject(created.outcome.diagnostic ?? "GLOBAL_LOAD_SLOT");
  tx.state = created.state;
  tx.namespace.set(name, id);
  assertCanonicalSourceRoot(tx);
  return P(id);
}

function resolveWithLoad(tx, frameId, address) {
  const parsed = parseAddress(address);
  try {
    if (parsed.kind === "global") stageLoadNamespace(tx, parsed.name);
    const resolved = resolveParsedExisting(tx, frameId, parsed);
    observeReads(tx, resolved.readSlots);
    record(tx, { op: "resolve", frame: frameId, address, slot: resolved.slot.id, readSlots: resolved.readSlots, status: "OK" });
    return resolved;
  } catch (error) {
    if (error?.diagnostic) {
      record(tx, { op: "resolve", frame: frameId, address, status: "REJECT", diagnostic: error.diagnostic });
    }
    throw error;
  }
}

function createNullMember(tx, owner, label) {
  const nullEndpoint = appendJSON(tx, null, "lvalue-null");
  const id = freshRelation(tx);
  applyOneMO(tx, { op: "createRelation", id, owner, label, target: nullEndpoint }, "lvalue-member");
  return P(id);
}

function guardedRebind(tx, slot, target, reason) {
  if (slot.id === PC2_A1_ROOT_SOURCE_SLOT) {
    record(tx, { op: "protected-root-guard", slot: slot.id, reason, status: "REJECT", diagnostic: "PROTECTED_SOURCE_ROOT" });
    reject("PROTECTED_SOURCE_ROOT");
  }
  applyOneMO(tx, { op: "rebindRelation", id: slot.id, target }, reason);
  assertCanonicalSourceRoot(tx);
}

function planOneLValue(tx, frameId, address) {
  const parsed = parseAddress(address);
  if (parsed.kind === "global" && !tx.namespace.has(parsed.name)) stageLoadNamespace(tx, parsed.name);
  let slot = rootSlotForParsed(tx, frameId, parsed);
  const pathSlots = [slot.id];

  for (const segment of parsed.segments) {
    let relation = requireRelation(tx.state, slot);
    let owner = endpointCopy(relation.target);
    let label = labelForOwner(tx.state, owner, segment);
    let matches = matchingMemberRelations(tx.state, owner, label);
    if (matches.length > 1) reject("AMBIGUOUS_CONTEXT_PATH");
    if (matches.length === 1) {
      const [id, member] = matches[0];
      if (!member.bound) reject("UNBOUND_SLOT");
      slot = P(id);
      pathSlots.push(id);
      continue;
    }

    if (owner.sort === "P") reject("NON_MATERIALIZABLE_OWNER");
    const node = tx.state.mo.nodes.get(owner.id);
    if (!node) reject("MISSING_OWNER");

    if (node.kind === "null") {
      const objectEndpoint = appendJSON(tx, {}, "lvalue-promote");
      guardedRebind(tx, slot, objectEndpoint, "lvalue-promote-rebind");
      relation = requireRelation(tx.state, slot);
      owner = endpointCopy(relation.target);
      label = Key(segment);
      matches = matchingMemberRelations(tx.state, owner, label);
    } else if (node.kind === "array") {
      reject("ARRAY_AUTOEXTEND_UNSUPPORTED");
    } else if (node.kind !== "object") {
      reject("NON_MATERIALIZABLE_OWNER");
    }

    if (matches.length > 1) reject("AMBIGUOUS_CONTEXT_PATH");
    if (matches.length === 1) {
      const [id, member] = matches[0];
      if (!member.bound) reject("UNBOUND_SLOT");
      slot = P(id);
    } else {
      slot = createNullMember(tx, owner, label);
    }
    pathSlots.push(slot.id);
  }
  observeReads(tx, pathSlots);
  const result = { address, slot, pathSlots, parsed };
  record(tx, { op: "plan-lvalue", frame: frameId, address, slot: slot.id, pathSlots });
  return result;
}

function planLValues(tx, frameId, addresses, { conflictCheck = true } = {}) {
  const plans = addresses.map(address => planOneLValue(tx, frameId, address));
  if (!conflictCheck) return plans;
  for (let i = 0; i < plans.length; i += 1) {
    for (let j = i + 1; j < plans.length; j += 1) {
      if (plans[i].slot.id === plans[j].slot.id) reject("H_ALIAS_CONFLICT");
      if (plans[j].pathSlots.slice(0, -1).includes(plans[i].slot.id) ||
          plans[i].pathSlots.slice(0, -1).includes(plans[j].slot.id)) {
        reject("H_PREFIX_CONFLICT");
      }
    }
  }
  return plans;
}

export function stagePlanLValuesPC2A1(session, frameId, addresses, options = {}) {
  const tx = beginTransaction(session);
  const plans = planLValues(tx, frameId, addresses, options);
  return { session: committedSession(tx), plans, attemptedTrace: tx.attemptedTrace };
}

function exactReference(tx, slot) {
  const relation = readRelation(tx, slot);
  if (relation.target.sort !== "N") return null;
  const node = tx.state.mo.nodes.get(relation.target.id);
  if (!node || node.kind !== "object") return null;
  const structural = structuralRelations(tx.state, relation.target);
  const refEntries = structural.filter(([, member]) => member.label.kind === "key" && member.label.value === "$ref");
  if (refEntries.length === 0) return null;
  if (structural.length !== 1 || refEntries.length !== 1) reject("MALFORMED_REFERENCE");
  const [refId, refRelation] = refEntries[0];
  observeReads(tx, [refId]);
  if (!refRelation.bound || refRelation.target.sort !== "N") reject("MALFORMED_REFERENCE");
  const value = projectValue(tx, refRelation.target);
  if (typeof value !== "string") reject("MALFORMED_REFERENCE");
  return value;
}

function prepareRoleTerm(tx, callerFrame, sourceSlot, { lvalue }) {
  const address = exactReference(tx, sourceSlot);
  if (address === null) return { slot: sourceSlot, reads: [] };
  if (lvalue) {
    const plan = planLValues(tx, callerFrame, [address], { conflictCheck: false })[0];
    return { slot: plan.slot, reads: plan.pathSlots };
  }
  const resolved = resolveWithLoad(tx, callerFrame, address);
  return { slot: resolved.slot, reads: resolved.readSlots };
}

function prepareController(tx, callerFrame, controllerSlot) {
  const address = exactReference(tx, controllerSlot);
  if (address === null) return { kind: "slot", slot: controllerSlot, reads: [] };
  const resolved = resolveWithLoad(tx, callerFrame, address);
  return { kind: "ref", slot: resolved.slot, reads: resolved.readSlots };
}

function writeScalarToR(tx, frameId, value) {
  if (value === null) return;
  const endpoint = appendJSON(tx, value, "scalar-copy");
  const slot = frameRoleSlot(tx.state, frameId, "R");
  guardedRebind(tx, slot, endpoint, "scalar-write");
  record(tx, { op: "scalar", frame: frameId, R: slot.id, value });
}

function normalizePublicPSlot(value) {
  if (typeof value === "string") return P(value);
  if (!value || typeof value !== "object" || value.sort !== "P" || typeof value.id !== "string") {
    reject("INVALID_SLOT");
  }
  return P(value.id);
}

function copySlots(tx, O, S, frameId = null) {
  const source = readRelation(tx, O);
  readRelation(tx, S);
  if (O.id === S.id) {
    record(tx, { op: "copy", frame: frameId, O: O.id, S: S.id, status: "NOOP_SAME_P" });
    return;
  }
  let value;
  try {
    value = projectValue(tx, source.target);
  } catch (error) {
    if (error?.diagnostic) reject("COPY_NONPROJECTABLE");
    throw error;
  }
  const endpoint = appendJSON(tx, value, "copy-embed");
  guardedRebind(tx, S, endpoint, "copy-rebind");
  record(tx, { op: "copy", frame: frameId, O: O.id, S: S.id, status: "OK" });
}

export function copyPC2A1Slots(session, O, S) {
  const tx = beginTransaction(session);
  try {
    const oSlot = normalizePublicPSlot(O);
    const sSlot = normalizePublicPSlot(S);
    copySlots(tx, oSlot, sSlot);
    return {
      session: committedSession(tx),
      diagnostic: null,
      attemptedTrace: tx.attemptedTrace,
      committedTrace: tx.attemptedTrace.map(entry => cloneJSON(entry))
    };
  } catch (error) {
    if (!error?.diagnostic) throw error;
    return { session, diagnostic: error.diagnostic, attemptedTrace: tx.attemptedTrace, committedTrace: [] };
  }
}

function primitiveCopy(tx, frameId) {
  copySlots(tx, frameRoleSlot(tx.state, frameId, "O"), frameRoleSlot(tx.state, frameId, "S"), frameId);
}

function primitiveAddEntity(tx, frameId) {
  const O = frameRoleSlot(tx.state, frameId, "O");
  const S = frameRoleSlot(tx.state, frameId, "S");
  const source = readRelation(tx, O);
  let value;
  try {
    value = projectValue(tx, source.target);
  } catch (error) {
    if (error?.diagnostic) reject("ADD_ENTITY_NONPROJECTABLE");
    throw error;
  }

  let name;
  do {
    name = `pc2-ent-${tx.host.nextEntity++}`;
  } while (tx.registry.has(name) || tx.namespace.has(name));

  tx.registry.set(name, cloneJSON(value));
  record(tx, { op: "host.add", name, frame: frameId, status: "STAGED" });
  const endpoint = appendJSON(tx, name, "add-entity-id");
  guardedRebind(tx, S, endpoint, "add-entity-result");
  record(tx, { op: "add_entity", frame: frameId, O: O.id, S: S.id, name, status: "OK" });
}

function primitivePredicateKind(tx, frameId, expectedKind) {
  const O = frameRoleSlot(tx.state, frameId, "O");
  const relation = readRelation(tx, O);
  const value = relation.target.sort === "N" ? tx.state.mo.nodes.get(relation.target.id) : null;
  return writeScalarToR(tx, frameId, value?.kind === expectedKind);
}

function aliasSlots(tx, O, S, frameId = null) {
  const source = readRelation(tx, O);
  const target = readRelation(tx, S);
  if (O.id === S.id || sameEndpoint(source.target, target.target)) {
    record(tx, { op: "alias", frame: frameId, O: O.id, S: S.id, status: "NOOP" });
    return;
  }
  if (tx.capability) reject("ITERATOR_UNPROVEN_EFFECT");
  guardedRebind(tx, S, endpointCopy(source.target), "alias-rebind");
  record(tx, { op: "alias", frame: frameId, O: O.id, S: S.id, status: "OK" });
}

function primitiveAlias(tx, frameId) {
  aliasSlots(tx, frameRoleSlot(tx.state, frameId, "O"), frameRoleSlot(tx.state, frameId, "S"), frameId);
}

function primitiveView(tx, frameId) {
  const current = frameRecord(tx.state, frameId);
  if (current.parent === null) reject("VIEW_PARENT_REQUIRED");
  const parent = frameRecord(tx.state, current.parent);
  const view = createFrameTx(tx, {
    E: parent.roles.E,
    O: parent.roles.O,
    R: current.roles.S,
    S: parent.roles.S
  }, current.parent, "VIEW");
  record(tx, {
    op: "view-enter",
    from: frameId,
    to: view,
    parent: current.parent,
    model: current.roles.O,
    R: current.roles.S
  });
  return executeSlot(tx, view, P(current.roles.O));
}

function collectStructuralClosure(tx, rootSlot) {
  const root = readRelation(tx, rootSlot);
  const Pset = new Set([rootSlot.id]);
  const Nset = new Set();
  const stack = [endpointCopy(root.target)];
  while (stack.length) {
    const endpoint = stack.pop();
    if (endpoint.sort !== "N") reject("ITERATOR_NONPROJECTABLE");
    if (Nset.has(endpoint.id)) continue;
    const node = tx.state.mo.nodes.get(endpoint.id);
    if (!node) reject("ITERATOR_NONPROJECTABLE");
    Nset.add(endpoint.id);
    for (const [id, relation] of structuralRelations(tx.state, endpoint)) {
      if (!relation.bound || relation.target.sort !== "N") reject("ITERATOR_NONPROJECTABLE");
      Pset.add(id);
      observeReads(tx, [id]);
      stack.push(endpointCopy(relation.target));
    }
  }
  return { P: Pset, N: Nset };
}

function setIntersects(a, b) {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function compoundIntersection(tx, a, b) {
  for (const id of a) {
    if (!b.has(id)) continue;
    const kind = tx.state.mo.nodes.get(id)?.kind;
    if (kind === "array" || kind === "object") return true;
  }
  return false;
}

function iteratorPreflight(tx, frameId, kind) {
  if (tx.capability) reject("ITERATOR_UNPROVEN_EFFECT");
  const frame = frameRecord(tx.state, frameId);
  if (frame.parent === null) reject("ITERATOR_PARENT_REQUIRED");
  const E = P(frame.roles.E);
  const O = P(frame.roles.O);
  const R = P(frame.roles.R);
  const S = P(frame.roles.S);
  for (const slot of [E, O, R, S]) requireRelation(tx.state, slot);
  if (R.id === PC2_A1_ROOT_SOURCE_SLOT || R.id === O.id || R.id === S.id || R.id === E.id) {
    reject("ITERATOR_OUTPUT_OVERLAP");
  }

  const inputClosure = collectStructuralClosure(tx, O);
  const modelClosureE = collectStructuralClosure(tx, E);
  const modelClosureS = collectStructuralClosure(tx, S);
  const outputClosure = collectStructuralClosure(tx, R);
  const protectedP = new Set([...inputClosure.P, ...modelClosureE.P, ...modelClosureS.P]);
  const protectedN = new Set([...inputClosure.N, ...modelClosureE.N, ...modelClosureS.N]);
  if (protectedP.has(R.id) || setIntersects(outputClosure.P, protectedP) ||
      compoundIntersection(tx, outputClosure.N, protectedN)) {
    reject("ITERATOR_OUTPUT_OVERLAP");
  }

  const inputRelation = readRelation(tx, O);
  let items;
  if (inputRelation.target.sort !== "N") reject("ITERATOR_INPUT_REQUIRED");
  const inputNode = tx.state.mo.nodes.get(inputRelation.target.id);
  if (kind === "where" && inputNode?.kind === "null") items = [];
  else {
    if (inputNode?.kind !== "array") {
      if (kind === "foreachobj" && inputNode?.kind === "null") reject("ITERATOR_INPUT_REQUIRED");
      reject("ARRAY_REQUIRED");
    }
    items = arrayMembers(tx.state, inputRelation.target);
    // Validate the full finite JSON image before output mutation.
    projectValue(tx, inputRelation.target);
  }

  const outputRelation = readRelation(tx, R);
  if (outputRelation.target.sort !== "N") reject("ITERATOR_OUTPUT_INVALID");
  const outputNode = tx.state.mo.nodes.get(outputRelation.target.id);
  if (kind === "where") {
    if (outputNode?.kind !== "null" && outputNode?.kind !== "array") reject("ITERATOR_OUTPUT_INVALID");
    if (outputNode?.kind === "array") arrayMembers(tx.state, outputRelation.target);
  } else {
    if (outputNode?.kind !== "null" && outputNode?.kind !== "array") reject("ITERATOR_OUTPUT_INVALID");
    if (outputNode?.kind === "array" && arrayMembers(tx.state, outputRelation.target).length !== 0) {
      reject("ITERATOR_OUTPUT_NOT_EMPTY");
    }
  }

  record(tx, {
    op: "iterator-enter",
    kind,
    frame: frameId,
    E: E.id,
    O: O.id,
    R: R.id,
    S: S.id,
    count: items.length
  });
  const freshArray = appendJSON(tx, [], `${kind}-output-array`);
  guardedRebind(tx, R, freshArray, `${kind}-output-reset`);
  return { frame, E, O, R, S, items, outputArray: freshArray };
}

function createIteratorIndex(tx, outputSlot, index, kind) {
  const output = readRelation(tx, outputSlot);
  if (output.target.sort !== "N" || tx.state.mo.nodes.get(output.target.id)?.kind !== "array") {
    reject("ITERATOR_OUTPUT_INVALID");
  }
  const initial = appendJSON(tx, null, `${kind}-item-null`);
  const id = freshRelation(tx);
  applyOneMO(tx, {
    op: "createRelation",
    id,
    owner: endpointCopy(output.target),
    label: Index(index),
    target: initial
  }, `${kind}-item-index`);
  return P(id);
}

function withIteratorCapability(tx, capability, fn) {
  const previous = tx.capability;
  tx.capability = capability;
  try {
    return fn();
  } finally {
    tx.capability = previous;
  }
}

function itemCapability(resultP, outputP, outputN, previousP, previousN, itemIndex) {
  return {
    kind: "iterator-item",
    itemIndex,
    ownedP: new Set([resultP.id]),
    ownedN: new Set(),
    forbiddenReadP: new Set([outputP.id, ...previousP]),
    forbiddenReadN: new Set([outputN.id, ...previousN])
  };
}

function primitiveWhere(tx, frameId) {
  const prep = iteratorPreflight(tx, frameId, "where");
  const previousP = [];
  const previousN = [];
  let outputIndex = 0;
  for (let i = 0; i < prep.items.length; i += 1) {
    const itemP = prep.items[i];
    consumeExecutionFuel(tx, frameId, itemP);
    const boolEndpoint = appendJSON(tx, null, "where-bool-null");
    const boolP = createRuntimeSlot(tx, boolEndpoint, "where-bool-slot");
    const itemFrame = createFrameTx(tx, {
      E: prep.E.id,
      O: itemP.id,
      R: boolP.id,
      S: boolP.id
    }, prep.frame.parent, "where-item");
    record(tx, { op: "iterator-item", kind: "where", index: i, frame: itemFrame, O: itemP.id, R: boolP.id, S: boolP.id });
    const cap = itemCapability(boolP, prep.R, prep.outputArray, previousP, previousN, i);
    withIteratorCapability(tx, cap, () => executeSlot(tx, itemFrame, prep.S));

    const boolRelation = readRelation(tx, boolP);
    const boolNode = boolRelation.target.sort === "N" ? tx.state.mo.nodes.get(boolRelation.target.id) : null;
    if (boolNode?.kind !== "boolean" || boolNode.payload !== true) continue;

    const outP = createIteratorIndex(tx, prep.R, outputIndex++, "where");
    copySlots(tx, itemP, outP, itemFrame);
    const outRel = readRelation(tx, outP);
    previousP.push(outP.id);
    if (outRel.target.sort === "N") previousN.push(outRel.target.id);
  }
  const resultRelation = readRelation(tx, prep.R);
  record(tx, {
    op: "iterator-exit",
    kind: "where",
    frame: frameId,
    R: prep.R.id,
    result: projectValue(tx, resultRelation.target)
  });
}

function primitiveForeach(tx, frameId) {
  const prep = iteratorPreflight(tx, frameId, "foreachobj");
  const previousP = [];
  const previousN = [];
  for (let i = 0; i < prep.items.length; i += 1) {
    consumeExecutionFuel(tx, frameId, prep.items[i]);
    // Iterator allocator creates exactly one fresh result occurrence before body execution.
    const resultP = createIteratorIndex(tx, prep.R, i, "foreachobj");
    const itemFrame = createFrameTx(tx, {
      E: prep.E.id,
      O: prep.items[i].id,
      R: resultP.id,
      S: resultP.id
    }, prep.frame.parent, "foreach-item");
    record(tx, {
      op: "iterator-item",
      kind: "foreachobj",
      index: i,
      frame: itemFrame,
      O: prep.items[i].id,
      R: resultP.id,
      S: resultP.id
    });
    const cap = itemCapability(resultP, prep.R, prep.outputArray, previousP, previousN, i);
    withIteratorCapability(tx, cap, () => executeSlot(tx, itemFrame, prep.S));
    const resultRelation = readRelation(tx, resultP);
    previousP.push(resultP.id);
    if (resultRelation.target.sort === "N") previousN.push(resultRelation.target.id);
  }
  const outputRelation = readRelation(tx, prep.R);
  record(tx, {
    op: "iterator-exit",
    kind: "foreachobj",
    frame: frameId,
    R: prep.R.id,
    result: projectValue(tx, outputRelation.target)
  });
}

function dispatchPrimitive(tx, frameId, name) {
  record(tx, { op: "primitive-dispatch", frame: frameId, name });
  if (name === "=") return primitiveCopy(tx, frameId);
  if (name === "add_entity") {
    if (tx.capability) reject("ITERATOR_UNPROVEN_EFFECT");
    return primitiveAddEntity(tx, frameId);
  }
  if (tx.profile !== EXEC_PROFILE_A2) reject("UNKNOWN_CONTROLLER");
  if (name === "is_string") return primitivePredicateKind(tx, frameId, "string");
  if (name === "is_null") return primitivePredicateKind(tx, frameId, "null");
  if (name === "where") return primitiveWhere(tx, frameId);
  if (name === "foreachobj") return primitiveForeach(tx, frameId);
  if (name === "ALIAS") return primitiveAlias(tx, frameId);
  if (name === "VIEW") return primitiveView(tx, frameId);
  reject("UNKNOWN_CONTROLLER");
}

function executeVector(tx, frameId, endpoint) {
  const items = arrayMembers(tx.state, endpoint);
  for (const item of items) executeSlot(tx, frameId, item);
}

function prepareBranchTerm(tx, frameId, sourceSlot) {
  const address = exactReference(tx, sourceSlot);
  if (address !== null) {
    const resolved = resolveWithLoad(tx, frameId, address);
    return { kind: "ref", slot: resolved.slot, reads: resolved.readSlots };
  }
  const relation = readRelation(tx, sourceSlot);
  if (relation.target.sort === "N" && tx.state.mo.nodes.get(relation.target.id)?.kind === "string") {
    const name = projectValue(tx, relation.target);
    if (tx.profile === EXEC_PROFILE_A1) return { kind: "primitive", name, reads: [] };
    // A2 EXEC keeps a bare string unresolved during C preparation. The common
    // executeSlot dispatch resolves primitive/address semantics in the sibling H.
    return { kind: "slot", slot: sourceSlot, reads: [] };
  }
  return { kind: "slot", slot: sourceSlot, reads: [] };
}

function executePreparedBranch(tx, frameId, prepared) {
  if (prepared.kind === "primitive") return dispatchPrimitive(tx, frameId, prepared.name);
  return executeSlot(tx, frameId, prepared.slot);
}

function consumeExecutionFuel(tx, frameId, slot) {
  const remaining = tx.executionBudget ? tx.executionBudget.remaining : tx.executionFuel;
  if (!Number.isInteger(remaining) || remaining <= 0) {
    record(tx, {
      op: "execution-fuel",
      frame: frameId,
      slot: slot?.id ?? null,
      remaining: 0,
      status: "REJECT",
      diagnostic: "EXECUTION_FUEL_EXHAUSTED"
    });
    reject("EXECUTION_FUEL_EXHAUSTED");
  }
  if (tx.executionBudget) tx.executionBudget.remaining -= 1;
  else tx.executionFuel -= 1;
}

function footprintFromTrace(trace, observedReads, preparedReads, baselineRelations) {
  const reads = new Set([...observedReads, ...preparedReads]);
  const writes = new Set();
  let unproven = false;

  for (const event of trace) {
    if (event.op === "resolve" && event.status === "OK") {
      for (const id of event.readSlots ?? []) reads.add(id);
    }
    if (event.op === "exec-slot" && event.slot) reads.add(event.slot);
    if (event.op === "copy" && event.O) reads.add(event.O);
    if (event.op === "add_entity" && event.O) reads.add(event.O);

    const actions = [];
    if (event.action) actions.push(event.action);
    if (Array.isArray(event.actions)) actions.push(...event.actions);
    for (const action of actions) {
      if (action?.op === "rebindRelation" || action?.op === "unbindRelation" || action?.op === "deleteRelation") {
        if (baselineRelations.has(action.id)) writes.add(action.id);
        else unproven = true;
      } else if (action?.op !== "createNode" && action?.op !== "createRelation") {
        // A1's remaining admitted MO actions only allocate fresh objects.
        // A new effect must be explicitly classified before multi-H admission.
        unproven = true;
      }
    }

    if (event.op === "lvalue-member" ||
        event.op === "lvalue-promote" ||
        event.op === "lvalue-promote-rebind" ||
        event.op === "host.add" ||
        event.op === "host.load" ||
        event.op === "iterator-enter" ||
        event.op === "view-enter" ||
        event.op === "alias") {
      unproven = true;
    }
  }

  return { reads, writes, unproven };
}

function intersects(a, b) {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function preflightHBranch(tx, source, plan, prepared) {
  const probe = beginProbeTransaction(tx);
  const baselineRelations = new Set(probe.state.mo.relations.keys());
  const h = createFrameTx(probe, {
    E: source.roles.E,
    O: source.roles.O,
    R: plan.slot.id,
    S: source.roles.S
  }, source.parent, "H-preflight");

  try {
    executePreparedBranch(probe, h, prepared);
  } catch (error) {
    if (error?.diagnostic) {
      record(tx, { op: "H-preflight", R: plan.slot.id, status: "REJECT", diagnostic: error.diagnostic });
    }
    throw error;
  }

  return footprintFromTrace(probe.attemptedTrace, probe.readDependencies,
    [...(prepared.reads ?? []), ...plan.pathSlots], baselineRelations);
}

function validateHBranchIndependence(tx, source, plans, prepared) {
  if (plans.length <= 1) return;

  const footprints = plans.map((plan, index) => preflightHBranch(tx, source, plan, prepared[index]));
  if (footprints.some(footprint => footprint.unproven)) {
    reject("H_UNPROVEN_INTERFERENCE");
  }

  for (let i = 0; i < footprints.length; i += 1) {
    for (let j = i + 1; j < footprints.length; j += 1) {
      if (intersects(footprints[i].writes, footprints[j].writes)) {
        reject("H_WRITE_WRITE_CONFLICT");
      }
      if (intersects(footprints[i].writes, footprints[j].reads) ||
          intersects(footprints[j].writes, footprints[i].reads)) {
        reject("H_READ_WRITE_CONFLICT");
      }
    }
  }
}

function executeLambdaObject(tx, frameId, modelSlot) {
  const { members } = objectMembers(tx, modelSlot);
  const branches = [...members.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  if (branches.length === 0) return;

  const plans = planLValues(tx, frameId, branches.map(([key]) => key));
  const prepared = branches.map(([, slot]) => {
    const start = tx.readDependencies.length;
    const term = prepareBranchTerm(tx, frameId, slot);
    return { ...term, reads: [...new Set([...term.reads, ...tx.readDependencies.slice(start)])] };
  });
  const destinations = new Set(plans.map(plan => plan.slot.id));
  for (const branch of prepared) {
    if (branch.reads.some(id => destinations.has(id))) reject("H_READ_WRITE_CONFLICT");
  }

  const source = frameRecord(tx.state, frameId);
  validateHBranchIndependence(tx, source, plans, prepared);

  for (let i = 0; i < branches.length; i += 1) {
    const [key, sourceSlot] = branches[i];
    const plan = plans[i];
    const h = createFrameTx(tx, {
      E: source.roles.E,
      O: source.roles.O,
      R: plan.slot.id,
      S: source.roles.S
    }, source.parent, "H");
    record(tx, {
      op: "H-route",
      from: frameId,
      to: h,
      parent: source.parent,
      sourceBranch: sourceSlot.id,
      key,
      R: plan.slot.id,
      resolutionFrame: frameId,
      preparedKind: prepared[i].kind,
      preparedSlot: prepared[i].slot?.id ?? null
    });
    executePreparedBranch(tx, h, prepared[i]);
  }
}

function executeEntity(tx, callerFrame, modelSlot) {
  const { members } = objectMembers(tx, modelSlot);
  const controllerSlot = members.get(ROLE_KEY.R);
  if (!controllerSlot) return executeLambdaObject(tx, callerFrame, modelSlot);

  const callerR = frameRoleSlot(tx.state, callerFrame, "R");
  const O = members.has(ROLE_KEY.O)
    ? prepareRoleTerm(tx, callerFrame, members.get(ROLE_KEY.O), { lvalue: false }).slot
    : callerR;
  const controller = prepareController(tx, callerFrame, controllerSlot);
  const S = members.has(ROLE_KEY.S)
    ? prepareRoleTerm(tx, callerFrame, members.get(ROLE_KEY.S), { lvalue: true }).slot
    : callerR;

  const child = createFrameTx(tx, {
    E: modelSlot.id,
    O: O.id,
    R: callerR.id,
    S: S.id
  }, callerFrame, "V");
  record(tx, {
    op: "V-enter",
    from: callerFrame,
    to: child,
    E: modelSlot.id,
    O: O.id,
    R: callerR.id,
    S: S.id,
    sourceController: controllerSlot.id,
    preparedController: controller.kind === "ref" ? controller.slot.id : controllerSlot.id
  });

  if (controller.kind === "ref") return executeSlot(tx, child, controller.slot);
  return executeSlot(tx, child, controllerSlot);
}

function executeSlot(tx, frameId, slot) {
  consumeExecutionFuel(tx, frameId, slot);
  const relation = readRelation(tx, slot);
  record(tx, { op: "exec-slot", frame: frameId, slot: slot.id });
  const endpoint = relation.target;
  if (endpoint.sort !== "N") reject("EXEC_ENDPOINT_NOT_JSON_NODE");
  const node = tx.state.mo.nodes.get(endpoint.id);
  if (!node) reject("EXEC_ENDPOINT_MISSING");

  if (node.kind === "null") return;
  if (node.kind === "boolean" || node.kind === "number") {
    return writeScalarToR(tx, frameId, projectValue(tx, endpoint));
  }
  if (node.kind === "string") {
    const name = projectValue(tx, endpoint);
    const admitted = tx.profile === EXEC_PROFILE_A2 ? A2_ADMITTED_PRIMITIVES : A1_ADMITTED_PRIMITIVES;
    if (admitted.has(name)) return dispatchPrimitive(tx, frameId, name);
    if (tx.profile !== EXEC_PROFILE_A2) reject("UNKNOWN_CONTROLLER");
    const resolved = resolveWithLoad(tx, frameId, name);
    record(tx, { op: "exec-address", frame: frameId, address: name, slot: resolved.slot.id });
    return executeSlot(tx, frameId, resolved.slot);
  }
  if (node.kind === "array") return executeVector(tx, frameId, endpoint);

  const ref = exactReference(tx, slot);
  if (ref !== null) {
    const prepared = resolveWithLoad(tx, frameId, ref);
    record(tx, { op: "exec-ref", frame: frameId, address: ref, slot: prepared.slot.id });
    return executeSlot(tx, frameId, prepared.slot);
  }

  const { members } = objectMembers(tx, slot);
  if (members.has(ROLE_KEY.R)) return executeEntity(tx, frameId, slot);
  if (tx.profile === EXEC_PROFILE_A2 && slot.id === PC2_A1_ROOT_SOURCE_SLOT &&
      (members.has(ROLE_KEY.O) || members.has(ROLE_KEY.S))) {
    reject("NO_CONTROLLER");
  }
  return executeLambdaObject(tx, frameId, slot);
}

export function createPC2A1Session(source, { registry = {} } = {}) {
  const program = subjectivateNaturalJSON(source);
  const registryMap = registry instanceof Map
    ? new Map([...registry.entries()].map(([key, value]) => [key, cloneJSON(value)]))
    : new Map(sortedObjectEntries(registry).map(([key, value]) => [key, cloneJSON(value)]));
  const session = {
    state: program.state,
    sourceRoot: endpointCopy(program.sourceRoot),
    registry: registryMap,
    namespace: new Map(),
    allocator: { N: 1, P: 1, F: 1 },
    host: { nextEntity: 1 }
  };
  assertCanonicalSourceRoot(session);
  return session;
}

export function snapshotPC2A1Session(session) {
  assertCanonicalSourceRoot(session);
  return JSON.stringify({
    state: serializeE1State(session.state),
    sourceRoot: [session.sourceRoot.sort, session.sourceRoot.id],
    registry: mapJSON(session.registry),
    namespace: [...session.namespace.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
    allocator: { ...session.allocator },
    host: { ...session.host }
  });
}

function rootExecutionDisposition(context) {
  const rootSlot = P(PC2_A1_ROOT_SOURCE_SLOT);
  const relation = requireRelation(context.state, rootSlot);
  if (relation.target.sort !== "N") reject("SOURCE_ROOT_NOT_JSON_NODE");
  const node = context.state.mo.nodes.get(relation.target.id);
  if (!node) reject("SOURCE_ROOT_MISSING");
  if (node.kind !== "object") return "DATA";

  const roleKeys = new Set();
  for (const [, member] of structuralRelations(context.state, relation.target)) {
    if (member.label.kind !== "key") continue;
    if (member.label.value === ROLE_KEY.O || member.label.value === ROLE_KEY.R || member.label.value === ROLE_KEY.S) {
      if (roleKeys.has(member.label.value)) reject("DUPLICATE_SOURCE_KEY");
      roleKeys.add(member.label.value);
    }
  }
  if (roleKeys.has(ROLE_KEY.R)) return "EXEC";
  if (roleKeys.has(ROLE_KEY.O) || roleKeys.has(ROLE_KEY.S)) return "NO_CONTROLLER";
  return "DATA";
}

export function executePC2A1(session) {
  const tx = beginTransaction(session);
  try {
    const sourceRoot = assertCanonicalSourceRoot(tx);
    const disposition = rootExecutionDisposition(tx);
    if (disposition === "DATA") {
      return {
        session,
        result: projectPlainJSON(tx.state.mo, sourceRoot),
        resultSlot: null,
        hostFrame: null,
        diagnostic: null,
        attemptedTrace: [],
        committedTrace: []
      };
    }
    if (disposition === "NO_CONTROLLER") reject("NO_CONTROLLER");
    const initial = appendJSON(tx, null, "run-result-null");
    const runtime = createRuntimeSlot(tx, initial, "run-result-slot");
    const hostFrame = createFrameTx(tx, {
      E: PC2_A1_ROOT_SOURCE_SLOT,
      O: runtime.id,
      R: runtime.id,
      S: runtime.id
    }, null, "host-frame");

    executeSlot(tx, hostFrame, P(PC2_A1_ROOT_SOURCE_SLOT));
    assertCanonicalSourceRoot(tx);
    const resultRelation = requireRelation(tx.state, runtime);
    const result = projectPlainJSON(tx.state.mo, resultRelation.target);
    const next = committedSession(tx);
    return {
      session: next,
      result,
      resultSlot: runtime,
      hostFrame,
      diagnostic: null,
      attemptedTrace: tx.attemptedTrace,
      committedTrace: tx.attemptedTrace.map(entry => cloneJSON(entry))
    };
  } catch (error) {
    if (!error?.diagnostic) throw error;
    return {
      session,
      result: null,
      resultSlot: null,
      hostFrame: null,
      diagnostic: error.diagnostic,
      attemptedTrace: tx.attemptedTrace,
      committedTrace: []
    };
  }
}

export function executePC2A2(session, { entry } = {}) {
  if (entry === undefined) return executePC2A1(session);
  if (entry !== "EXEC") {
    return {
      session,
      result: null,
      resultSlot: null,
      hostFrame: null,
      diagnostic: "INVALID_EXECUTION_ENTRY",
      attemptedTrace: [],
      committedTrace: []
    };
  }

  const tx = beginTransaction(session, { profile: EXEC_PROFILE_A2 });
  try {
    assertCanonicalSourceRoot(tx);
    const initial = appendJSON(tx, null, "a2-run-result-null");
    const runtime = createRuntimeSlot(tx, initial, "a2-run-result-slot");
    const hostFrame = createFrameTx(tx, {
      E: PC2_A1_ROOT_SOURCE_SLOT,
      O: runtime.id,
      R: runtime.id,
      S: runtime.id
    }, null, "a2-host-frame");

    executeSlot(tx, hostFrame, P(PC2_A1_ROOT_SOURCE_SLOT));
    assertCanonicalSourceRoot(tx);
    const resultRelation = requireRelation(tx.state, runtime);
    const result = projectPlainJSON(tx.state.mo, resultRelation.target);
    const next = committedSession(tx);
    return {
      session: next,
      result,
      resultSlot: runtime,
      hostFrame,
      diagnostic: null,
      attemptedTrace: tx.attemptedTrace,
      committedTrace: tx.attemptedTrace.map(entry => cloneJSON(entry))
    };
  } catch (error) {
    if (!error?.diagnostic) throw error;
    return {
      session,
      result: null,
      resultSlot: null,
      hostFrame: null,
      diagnostic: error.diagnostic,
      attemptedTrace: tx.attemptedTrace,
      committedTrace: []
    };
  }
}
