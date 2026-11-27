import {
  Key,
  N,
  P,
  Role,
  createMOState,
  deserializeLosslessMO,
  executeMO,
  executeMOAtomically,
  executeMOSequence,
  losslessMOObject,
  normalizeEndpoint,
  sameEndpoint,
  serializeLosslessMO,
  validateMOState
} from "../../src/mo-core.js";

const FRAME_ROLES = Object.freeze(["E", "O", "R", "S"]);
const ROOT_TO_ROLE = Object.freeze({ ent: "E", obj: "O", rel: "R", sub: "S" });
const DUPLET_LABEL = Role("pc1:e1:duplet");

class E1Reject extends Error {
  constructor(diagnostic, message = diagnostic) {
    super(message);
    this.name = "E1Reject";
    this.diagnostic = diagnostic;
  }
}

function rejectE1(diagnostic, message) {
  throw new E1Reject(diagnostic, message);
}

function requireId(id, diagnostic = "INVALID_E1_ID") {
  if (typeof id !== "string" || id.length === 0 || id.includes("\0")) rejectE1(diagnostic);
  return id;
}

function requireRole(role) {
  if (!FRAME_ROLES.includes(role)) rejectE1("INVALID_FRAME_ROLE");
  return role;
}

function endpointKey(endpoint) {
  const e = normalizeEndpoint(endpoint);
  return e.sort + ":" + e.id;
}

function frameClone(frame) {
  return {
    id: frame.id,
    parent: frame.parent,
    roles: { E: frame.roles.E, O: frame.roles.O, R: frame.roles.R, S: frame.roles.S }
  };
}

function cloneFrames(frames) {
  return new Map([...frames].map(([id, frame]) => [id, frameClone(frame)]));
}

function copyState(state, { mo = state.mo, frames = state.frames, usedFrames = state.usedFrames } = {}) {
  return { mo, frames, usedFrames };
}

function relationSlot(state, slotId) {
  requireId(slotId, "INVALID_SLOT_ID");
  const relation = state.mo.relations.get(slotId);
  if (!relation) rejectE1("MISSING_SLOT");
  if (!relation.bound) rejectE1("UNBOUND_SLOT");
  return relation;
}

function frameRecord(state, frameId) {
  requireId(frameId, "INVALID_FRAME_ID");
  const frame = state.frames.get(frameId);
  if (!frame) rejectE1("MISSING_FRAME");
  return frame;
}

function freshFrameId(state, id) {
  requireId(id, "INVALID_FRAME_ID");
  if (state.usedFrames.has(id)) rejectE1("FRAME_NO_RESURRECTION");
  return id;
}

function addFrameUnchecked(state, frame) {
  const frames = cloneFrames(state.frames);
  const usedFrames = new Set(state.usedFrames);
  frames.set(frame.id, frameClone(frame));
  usedFrames.add(frame.id);
  const next = copyState(state, { frames, usedFrames });
  validateE1State(next);
  return next;
}

function transition(state, fn) {
  validateE1State(state);
  try {
    const result = fn();
    validateE1State(result.state);
    return result;
  } catch (error) {
    if (error?.diagnostic) {
      return {
        state,
        outcome: { status: "REJECT", diagnostic: error.diagnostic, semanticChange: false },
        trace: []
      };
    }
    throw error;
  }
}

function moTransition(state, action) {
  const result = executeMO(state.mo, action);
  if (result.outcome.status === "REJECT") {
    return {
      state,
      outcome: result.outcome,
      trace: []
    };
  }
  return {
    state: copyState(state, { mo: result.state }),
    outcome: result.outcome,
    trace: [{ action, outcome: result.outcome }]
  };
}

function decodePointerToken(token) {
  if (/~(?:[^01]|$)/.test(token)) rejectE1("INVALID_CONTEXT_PATH");
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function parseContextAddress(address) {
  if (typeof address !== "string") rejectE1("INVALID_CONTEXT_PATH");
  const match = /^(\$\$?)(rel|obj|sub|ent)\/(.*)$/.exec(address);
  if (!match) rejectE1("EXPLICIT_CONTEXT_ROOT_REQUIRED");
  return {
    parent: match[1] === "$$",
    role: ROOT_TO_ROLE[match[2]],
    segments: match[3].split("/").map(decodePointerToken)
  };
}

function findMemberSlot(state, owner, segment) {
  const normalizedOwner = normalizeEndpoint(owner);
  let expectedKind = "key";
  let expectedValue = segment;
  if (normalizedOwner.sort === "N") {
    const node = state.mo.nodes.get(normalizedOwner.id);
    if (node?.kind === "array") {
      if (!/^(0|[1-9]\d*)$/.test(segment)) rejectE1("INVALID_ARRAY_INDEX");
      const index = Number(segment);
      if (!Number.isSafeInteger(index)) rejectE1("INVALID_ARRAY_INDEX");
      expectedKind = "index";
      expectedValue = index;
    }
  }
  const matches = [];
  for (const [id, relation] of state.mo.relations) {
    if (!sameEndpoint(relation.owner, normalizedOwner)) continue;
    if (relation.label.kind !== expectedKind || relation.label.value !== expectedValue) continue;
    matches.push(id);
  }
  if (matches.length === 0) rejectE1("MISSING_CONTEXT_PATH");
  if (matches.length !== 1) rejectE1("AMBIGUOUS_CONTEXT_PATH");
  relationSlot(state, matches[0]);
  return matches[0];
}

export function createE1State(mo = createMOState()) {
  const state = { mo, frames: new Map(), usedFrames: new Set() };
  validateE1State(state);
  return state;
}

export function validateE1State(state) {
  if (!state || !(state.frames instanceof Map) || !(state.usedFrames instanceof Set)) rejectE1("INVALID_E1_STATE");
  validateMOState(state.mo);
  for (const id of state.usedFrames) requireId(id, "INVALID_FRAME_ID");
  for (const [id, frame] of state.frames) {
    requireId(id, "INVALID_FRAME_ID");
    if (frame?.id !== id) rejectE1("FRAME_ID_MISMATCH");
    if (!state.usedFrames.has(id)) rejectE1("LIVE_FRAME_ID_NOT_USED");
    if (frame.parent !== null) {
      requireId(frame.parent, "INVALID_FRAME_PARENT");
      if (!state.frames.has(frame.parent)) rejectE1("DANGLING_FRAME_PARENT");
    }
    if (!frame.roles || Object.keys(frame.roles).sort().join(",") !== "E,O,R,S") rejectE1("INVALID_FRAME_ROLES");
    for (const role of FRAME_ROLES) relationSlot(state, frame.roles[role]);
  }
  for (const id of state.frames.keys()) {
    const seen = new Set();
    let current = id;
    while (current !== null) {
      if (seen.has(current)) rejectE1("FRAME_PARENT_CYCLE");
      seen.add(current);
      current = state.frames.get(current)?.parent ?? null;
    }
  }
  return true;
}

export function createFrame(state, { id, parent = null, E, O, R, S }) {
  return transition(state, () => {
    freshFrameId(state, id);
    if (parent !== null) frameRecord(state, parent);
    const roles = { E, O, R, S };
    for (const role of FRAME_ROLES) relationSlot(state, roles[role]);
    const next = addFrameUnchecked(state, { id, parent, roles });
    return {
      state: next,
      outcome: { status: "OK", diagnostic: null, semanticChange: true, frame: id },
      trace: [{ op: "createFrame", id, parent, roles: { ...roles } }]
    };
  });
}

export function frameDepth(state, frameId) {
  validateE1State(state);
  let depth = 0;
  let frame = frameRecord(state, frameId);
  while (frame.parent !== null) {
    depth += 1;
    frame = frameRecord(state, frame.parent);
  }
  return depth;
}

export function frameRoleSlot(state, frameId, role) {
  validateE1State(state);
  const frame = frameRecord(state, frameId);
  return P(frame.roles[requireRole(role)]);
}

export function frameRoleValue(state, frameId, role) {
  const slot = frameRoleSlot(state, frameId, role);
  return normalizeEndpoint(relationSlot(state, slot.id).target);
}

export function frameRE(state, frameId) {
  return { R: frameRoleValue(state, frameId, "R"), E: frameRoleValue(state, frameId, "E") };
}

export function createDuplet(state, { id, begin, end }) {
  validateE1State(state);
  return moTransition(state, {
    op: "createRelation",
    id,
    owner: normalizeEndpoint(begin),
    label: DUPLET_LABEL,
    target: normalizeEndpoint(end)
  });
}

export function readDuplet(state, id) {
  validateE1State(state);
  requireId(id, "INVALID_DUPLET_ID");
  const relation = state.mo.relations.get(id);
  if (!relation || relation.label.kind !== DUPLET_LABEL.kind || relation.label.value !== DUPLET_LABEL.value || !relation.bound) {
    rejectE1("MISSING_DUPLET");
  }
  return { id, begin: normalizeEndpoint(relation.owner), end: normalizeEndpoint(relation.target) };
}

export function reattachDupletBegin(state, id, begin) {
  validateE1State(state);
  readDuplet(state, id);
  return moTransition(state, { op: "moveRelation", id, owner: normalizeEndpoint(begin) });
}

export function rebindDupletEnd(state, id, end) {
  validateE1State(state);
  readDuplet(state, id);
  return moTransition(state, { op: "rebindRelation", id, target: normalizeEndpoint(end) });
}

export function resolveContextualSlot(state, frameId, address) {
  validateE1State(state);
  const parsed = parseContextAddress(address);
  let frame = frameRecord(state, frameId);
  if (parsed.parent) {
    if (frame.parent === null) rejectE1("MISSING_PARENT_CONTEXT");
    frame = frameRecord(state, frame.parent);
  }
  let slotId = frame.roles[parsed.role];
  let relation = relationSlot(state, slotId);
  let owner = normalizeEndpoint(relation.target);
  for (const segment of parsed.segments) {
    slotId = findMemberSlot(state, owner, segment);
    relation = relationSlot(state, slotId);
    owner = normalizeEndpoint(relation.target);
  }
  return P(slotId);
}

export function H(state, { frame: frameId, path, id }) {
  return transition(state, () => {
    const source = frameRecord(state, frameId);
    freshFrameId(state, id);
    const routed = resolveContextualSlot(state, frameId, path);
    const nextFrame = {
      id,
      parent: source.parent,
      roles: { E: source.roles.E, O: source.roles.O, R: routed.id, S: source.roles.S }
    };
    const next = addFrameUnchecked(state, nextFrame);
    return {
      state: next,
      outcome: { status: "OK", diagnostic: null, semanticChange: true, frame: id },
      trace: [{ op: "H", from: frameId, to: id, path, routed: routed.id }]
    };
  });
}

export function V(state, { frame: frameId, modelSlot, id, O = null, S = null }) {
  return transition(state, () => {
    const source = frameRecord(state, frameId);
    freshFrameId(state, id);
    relationSlot(state, modelSlot);
    if (O !== null) relationSlot(state, O);
    if (S !== null) relationSlot(state, S);
    const nextFrame = {
      id,
      parent: source.id,
      roles: {
        E: modelSlot,
        O: O ?? source.roles.R,
        R: source.roles.R,
        S: S ?? source.roles.R
      }
    };
    const next = addFrameUnchecked(state, nextFrame);
    return {
      state: next,
      outcome: { status: "OK", diagnostic: null, semanticChange: true, frame: id },
      trace: [{ op: "V", from: frameId, to: id, modelSlot, O: nextFrame.roles.O, S: nextFrame.roles.S }]
    };
  });
}

export function Q(state, { frame: frameId, steps }) {
  validateE1State(state);
  const frame = frameRecord(state, frameId);
  if (!Array.isArray(steps)) {
    return { state, outcome: { status: "REJECT", diagnostic: "INVALID_Q_STEPS", semanticChange: false }, trace: [] };
  }
  const actions = [];
  const trace = [];
  try {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      if (!step || step.op !== "rebindRole") rejectE1("INVALID_Q_STEP");
      const role = requireRole(step.role);
      const target = normalizeEndpoint(step.target);
      const slot = frame.roles[role];
      relationSlot(state, slot);
      actions.push({ op: "rebindRelation", id: slot, target });
      trace.push({ index, op: "rebindRole", role, slot, target });
    }
  } catch (error) {
    if (error?.diagnostic) return { state, outcome: { status: "REJECT", diagnostic: error.diagnostic, semanticChange: false }, trace: [] };
    throw error;
  }
  const sequence = executeMOSequence(state.mo, actions);
  const rejected = sequence.history.find(entry => entry.outcome.status === "REJECT");
  const next = copyState(state, { mo: sequence.state });
  return {
    state: next,
    outcome: {
      status: rejected ? "REJECT" : "OK",
      diagnostic: rejected?.outcome.diagnostic ?? null,
      semanticChange: serializeLosslessMO(sequence.state) !== serializeLosslessMO(state.mo),
      frame: frameId
    },
    trace: trace.slice(0, sequence.history.length).map((entry, index) => ({ ...entry, outcome: sequence.history[index].outcome }))
  };
}

function writeDescriptor(state, write) {
  const frame = frameRecord(state, write.frame);
  const role = requireRole(write.role ?? "R");
  const slot = frame.roles[role];
  relationSlot(state, slot);
  return { frame: frame.id, role, slot, target: normalizeEndpoint(write.target) };
}

export function classifyBranchWrites(state, writes) {
  validateE1State(state);
  if (!Array.isArray(writes)) rejectE1("INVALID_BRANCH_WRITES");
  const normalized = writes.map(write => writeDescriptor(state, write));
  const bySlot = new Map();
  for (const write of normalized) {
    const prior = bySlot.get(write.slot);
    if (!prior) {
      bySlot.set(write.slot, write);
      continue;
    }
    if (!sameEndpoint(prior.target, write.target)) {
      return { status: "ALIAS_CONFLICT", slot: write.slot, writes: normalized };
    }
  }
  return { status: "DISJOINT_OR_COINCIDENT", slot: null, writes: normalized };
}

export function commitBranchWrites(state, writes) {
  validateE1State(state);
  let classification;
  try {
    classification = classifyBranchWrites(state, writes);
  } catch (error) {
    if (error?.diagnostic) return { state, outcome: { status: "REJECT", diagnostic: error.diagnostic, semanticChange: false }, trace: [] };
    throw error;
  }
  if (classification.status === "ALIAS_CONFLICT") {
    return {
      state,
      outcome: { status: "REJECT", diagnostic: "ALIAS_CONFLICT", semanticChange: false },
      trace: classification.writes
    };
  }
  const actions = classification.writes.map(write => ({ op: "rebindRelation", id: write.slot, target: write.target }));
  const result = executeMOAtomically(state.mo, actions);
  if (result.outcome.status === "REJECT") {
    return { state, outcome: result.outcome, trace: [] };
  }
  return {
    state: copyState(state, { mo: result.state }),
    outcome: result.outcome,
    trace: classification.writes
  };
}

export function factorBundle(entries, { preserveOccurrenceIdentity = true } = {}) {
  if (!Array.isArray(entries)) rejectE1("INVALID_BUNDLE");
  const seenIds = new Set();
  const table = new Map();
  const normalized = [];
  for (const raw of entries) {
    const id = requireId(raw?.id, "INVALID_BUNDLE_ID");
    if (seenIds.has(id)) rejectE1("DUPLICATE_BUNDLE_ID");
    seenIds.add(id);
    const entry = {
      id,
      R: normalizeEndpoint(raw.R),
      O: normalizeEndpoint(raw.O),
      S: normalizeEndpoint(raw.S)
    };
    normalized.push(entry);
    const key = endpointKey(entry.R) + "|" + endpointKey(entry.O);
    const prior = table.get(key);
    if (!prior) {
      table.set(key, entry);
      continue;
    }
    if (!sameEndpoint(prior.S, entry.S)) {
      return { status: "NON_FUNCTIONAL", entries: normalized, conflict: [prior.id, entry.id] };
    }
    if (preserveOccurrenceIdentity && prior.id !== entry.id) {
      return { status: "FALLBACK_IDENTITY", entries: normalized, conflict: [prior.id, entry.id] };
    }
  }
  return {
    status: "FACTORIZED",
    entries: normalized,
    table: [...table.values()].map(entry => ({ R: entry.R, O: entry.O, S: entry.S }))
  };
}

export function losslessE1Object(state) {
  validateE1State(state);
  return {
    $mo: "pc1-r2-e1/1",
    mo: losslessMOObject(state.mo),
    frames: [...state.frames].sort(([a], [b]) => a.localeCompare(b)).map(([, frame]) => ({
      id: frame.id,
      parent: frame.parent,
      roles: { E: frame.roles.E, O: frame.roles.O, R: frame.roles.R, S: frame.roles.S }
    })),
    usedFrames: [...state.usedFrames].sort()
  };
}

export function serializeE1State(state) {
  return JSON.stringify(losslessE1Object(state));
}

export function deserializeE1State(value) {
  const object = typeof value === "string" ? JSON.parse(value) : value;
  if (!object || object.$mo !== "pc1-r2-e1/1" || !object.mo || !Array.isArray(object.frames) || !Array.isArray(object.usedFrames)) {
    rejectE1("INVALID_E1_SERIALIZATION");
  }
  const state = {
    mo: deserializeLosslessMO(object.mo),
    frames: new Map(),
    usedFrames: new Set()
  };
  for (const id of object.usedFrames) {
    requireId(id, "INVALID_FRAME_ID");
    if (state.usedFrames.has(id)) rejectE1("INVALID_E1_SERIALIZATION");
    state.usedFrames.add(id);
  }
  for (const raw of object.frames) {
    const id = requireId(raw?.id, "INVALID_FRAME_ID");
    if (state.frames.has(id)) rejectE1("INVALID_E1_SERIALIZATION");
    const parent = raw.parent === null ? null : requireId(raw.parent, "INVALID_FRAME_PARENT");
    const roles = raw.roles;
    if (!roles || Object.keys(roles).sort().join(",") !== "E,O,R,S") rejectE1("INVALID_E1_SERIALIZATION");
    state.frames.set(id, { id, parent, roles: { E: roles.E, O: roles.O, R: roles.R, S: roles.S } });
  }
  validateE1State(state);
  return state;
}

export { Key, N, P, Role };
