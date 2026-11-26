export const JSON_NODE_KINDS = new Set(["null", "boolean", "number", "string", "array", "object"]);
const NODE_KINDS = new Set([...JSON_NODE_KINDS, "entity"]);
const LABEL_KINDS = new Set(["key", "index", "role", "tag"]);

class Reject extends Error {
  constructor(diagnostic, message = diagnostic) {
    super(message);
    this.name = "MOReject";
    this.diagnostic = diagnostic;
  }
}

export function reject(diagnostic, message) {
  throw new Reject(diagnostic, message);
}

function requireId(id) {
  if (typeof id !== "string" || id.length === 0 || id.includes("\0")) {
    reject("INVALID_ID", "Semantic IDs must be non-empty strings without NUL");
  }
  return id;
}

export function cloneJSON(value, depth = 0) {
  if (depth > 128) reject("INVALID_PAYLOAD", "Payload is too deep");
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) reject("INVALID_PAYLOAD", "Number payload must be finite");
    return value;
  }
  if (Array.isArray(value)) return value.map(item => cloneJSON(item, depth + 1));
  if (typeof value === "object" && value !== null && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const out = {};
    for (const key of Object.keys(value)) out[key] = cloneJSON(value[key], depth + 1);
    return out;
  }
  reject("INVALID_PAYLOAD", "Payload must be strict JSON data");
}

export function jsonEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    return ak.length === bk.length && ak.every((k, i) => k === bk[i] && jsonEqual(a[k], b[k]));
  }
  return false;
}

export function N(id) {
  return Object.freeze({ sort: "N", id: requireId(id) });
}

export function P(id) {
  return Object.freeze({ sort: "P", id: requireId(id) });
}

export function Key(value) {
  if (typeof value !== "string") reject("INVALID_LABEL", "Key labels require a string");
  return Object.freeze({ kind: "key", value });
}

export function Index(value) {
  if (!Number.isSafeInteger(value) || value < 0) reject("INVALID_LABEL", "Index labels require a non-negative safe integer");
  return Object.freeze({ kind: "index", value });
}

export function Role(value) {
  if (typeof value !== "string" || value.length === 0) reject("INVALID_LABEL", "Role labels require a non-empty string");
  return Object.freeze({ kind: "role", value });
}

export function Tag(value) {
  if (typeof value !== "string" || value.length === 0) reject("INVALID_LABEL", "Tag labels require a non-empty string");
  return Object.freeze({ kind: "tag", value });
}

function normalizeLabel(label) {
  if (!label || typeof label !== "object" || !LABEL_KINDS.has(label.kind)) reject("INVALID_LABEL");
  if (label.kind === "key") return Key(label.value);
  if (label.kind === "index") return Index(label.value);
  if (label.kind === "role") return Role(label.value);
  return Tag(label.value);
}

export function sameLabel(a, b) {
  return a.kind === b.kind && a.value === b.value;
}

function endpointKey(endpoint) {
  return `${endpoint.sort}:${endpoint.id}`;
}

export function normalizeEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== "object" || (endpoint.sort !== "N" && endpoint.sort !== "P")) reject("INVALID_ENDPOINT");
  return endpoint.sort === "N" ? N(endpoint.id) : P(endpoint.id);
}

export function sameEndpoint(a, b) {
  return a.sort === b.sort && a.id === b.id;
}

function endpointExists(state, endpoint) {
  return endpoint.sort === "N" ? state.nodes.has(endpoint.id) : state.relations.has(endpoint.id);
}

export function normalizeNode(kind, payload) {
  if (!NODE_KINDS.has(kind)) reject("INVALID_NODE_KIND");
  if (kind === "null") {
    if (payload !== undefined && payload !== null) reject("INVALID_PAYLOAD");
    return { kind, payload: null };
  }
  if (kind === "boolean") {
    if (typeof payload !== "boolean") reject("INVALID_PAYLOAD");
    return { kind, payload };
  }
  if (kind === "number") {
    if (typeof payload !== "number" || !Number.isFinite(payload)) reject("INVALID_PAYLOAD");
    return { kind, payload };
  }
  if (kind === "string") {
    if (typeof payload !== "string") reject("INVALID_PAYLOAD");
    return { kind, payload };
  }
  if (kind === "array" || kind === "object") {
    if (payload !== undefined && payload !== null) reject("INVALID_PAYLOAD");
    return { kind, payload: null };
  }
  return { kind, payload: cloneJSON(payload ?? null) };
}

export function createMOState() {
  return {
    nodes: new Map(),
    relations: new Map(),
    roots: [],
    used: { N: new Set(), P: new Set() }
  };
}

export function cloneMOState(state) {
  return {
    nodes: new Map([...state.nodes].map(([id, node]) => [id, { kind: node.kind, payload: cloneJSON(node.payload) }])),
    relations: new Map([...state.relations].map(([id, relation]) => [id, {
      owner: normalizeEndpoint(relation.owner),
      label: normalizeLabel(relation.label),
      bound: Boolean(relation.bound),
      target: relation.bound ? normalizeEndpoint(relation.target) : null
    }])),
    roots: state.roots.map(normalizeEndpoint),
    used: { N: new Set(state.used.N), P: new Set(state.used.P) }
  };
}

export function validateMOState(state) {
  if (!(state?.nodes instanceof Map) || !(state?.relations instanceof Map) || !(state?.used?.N instanceof Set) || !(state?.used?.P instanceof Set) || !Array.isArray(state.roots)) {
    reject("INVALID_STATE_SHAPE");
  }
  for (const [id, node] of state.nodes) {
    requireId(id);
    normalizeNode(node.kind, node.payload);
    if (!state.used.N.has(id)) reject("LIVE_ID_NOT_USED");
  }
  for (const [id, relation] of state.relations) {
    requireId(id);
    if (!state.used.P.has(id)) reject("LIVE_ID_NOT_USED");
    const owner = normalizeEndpoint(relation.owner);
    if (!endpointExists(state, owner)) reject("DANGLING_OWNER");
    normalizeLabel(relation.label);
    if (typeof relation.bound !== "boolean") reject("INVALID_RELATION_SHAPE");
    if (relation.bound) {
      const target = normalizeEndpoint(relation.target);
      if (!endpointExists(state, target)) reject("DANGLING_TARGET");
    } else if (relation.target !== null && relation.target !== undefined) {
      reject("INVALID_RELATION_SHAPE");
    }
  }
  const rootKeys = new Set();
  for (const root of state.roots) {
    const normalized = normalizeEndpoint(root);
    if (!endpointExists(state, normalized)) reject("DANGLING_ROOT");
    const key = endpointKey(normalized);
    if (rootKeys.has(key)) reject("DUPLICATE_ROOT");
    rootKeys.add(key);
  }
  return true;
}

function liveSets(state) {
  return { N: new Set(state.nodes.keys()), P: new Set(state.relations.keys()) };
}

function persistence(before, after) {
  const out = { N: [], P: [] };
  for (const sort of ["N", "P"]) {
    const a = sort === "N" ? before.nodes : before.relations;
    const b = sort === "N" ? after.nodes : after.relations;
    for (const id of [...a.keys()].sort()) if (b.has(id)) out[sort].push([id, id]);
  }
  return out;
}

function birthDeath(before, after) {
  const b = liveSets(before);
  const a = liveSets(after);
  const born = { N: [], P: [] };
  const dead = { N: [], P: [] };
  for (const sort of ["N", "P"]) {
    for (const id of [...a[sort]].sort()) if (!b[sort].has(id)) born[sort].push(id);
    for (const id of [...b[sort]].sort()) if (!a[sort].has(id)) dead[sort].push(id);
  }
  return { born, dead };
}

export function identityPersistence(state) {
  return persistence(state, state);
}

function relationReferences(state, endpoint, exceptRelationId = null) {
  const refs = [];
  for (const [id, relation] of state.relations) {
    if (id === exceptRelationId) continue;
    if (sameEndpoint(relation.owner, endpoint) || (relation.bound && sameEndpoint(relation.target, endpoint))) refs.push(id);
  }
  return refs;
}

function rootReferences(state, endpoint) {
  return state.roots.some(root => sameEndpoint(root, endpoint));
}

function applyAction(draft, action) {
  if (!action || typeof action !== "object" || typeof action.op !== "string") reject("INVALID_ACTION");
  switch (action.op) {
    case "createNode": {
      const id = requireId(action.id);
      if (draft.used.N.has(id)) reject("NO_RESURRECTION");
      const node = normalizeNode(action.kind, action.payload);
      draft.used.N.add(id);
      draft.nodes.set(id, node);
      return N(id);
    }
    case "deleteNode": {
      const id = requireId(action.id);
      if (!draft.nodes.has(id)) reject("MISSING_NODE");
      const endpoint = N(id);
      if (rootReferences(draft, endpoint)) reject("ROOT_CONFLICT");
      if (relationReferences(draft, endpoint).length) reject("NODE_REFERENCED");
      draft.nodes.delete(id);
      return endpoint;
    }
    case "createRelation": {
      const id = requireId(action.id);
      if (draft.used.P.has(id)) reject("NO_RESURRECTION");
      const owner = normalizeEndpoint(action.owner);
      if (!endpointExists(draft, owner)) reject("MISSING_OWNER");
      const label = normalizeLabel(action.label);
      const bound = action.target !== undefined && action.target !== null;
      const target = bound ? normalizeEndpoint(action.target) : null;
      if (bound && !endpointExists(draft, target)) reject("MISSING_TARGET");
      draft.used.P.add(id);
      draft.relations.set(id, { owner, label, bound, target });
      return P(id);
    }
    case "deleteRelation": {
      const id = requireId(action.id);
      if (!draft.relations.has(id)) reject("MISSING_RELATION");
      const endpoint = P(id);
      if (rootReferences(draft, endpoint)) reject("ROOT_CONFLICT");
      if (relationReferences(draft, endpoint, id).length) reject("RELATION_REFERENCED");
      draft.relations.delete(id);
      return endpoint;
    }
    case "relabelRelation": {
      const id = requireId(action.id);
      const relation = draft.relations.get(id);
      if (!relation) reject("MISSING_RELATION");
      const next = normalizeLabel(action.label);
      if (sameLabel(relation.label, next)) return P(id);
      relation.label = next;
      return P(id);
    }
    case "moveRelation": {
      const id = requireId(action.id);
      const relation = draft.relations.get(id);
      if (!relation) reject("MISSING_RELATION");
      const owner = normalizeEndpoint(action.owner);
      if (!endpointExists(draft, owner)) reject("MISSING_OWNER");
      const label = action.label === undefined ? relation.label : normalizeLabel(action.label);
      if (sameEndpoint(relation.owner, owner) && sameLabel(relation.label, label)) return P(id);
      relation.owner = owner;
      relation.label = label;
      return P(id);
    }
    case "rebindRelation": {
      const id = requireId(action.id);
      const relation = draft.relations.get(id);
      if (!relation) reject("MISSING_RELATION");
      if (action.target === undefined || action.target === null) {
        if (!relation.bound) return P(id);
        relation.bound = false;
        relation.target = null;
        return P(id);
      }
      const target = normalizeEndpoint(action.target);
      if (!endpointExists(draft, target)) reject("MISSING_TARGET");
      if (relation.bound && sameEndpoint(relation.target, target)) return P(id);
      relation.bound = true;
      relation.target = target;
      return P(id);
    }
    case "setNode": {
      const id = requireId(action.id);
      const current = draft.nodes.get(id);
      if (!current) reject("MISSING_NODE");
      const next = normalizeNode(action.kind, action.payload);
      if (current.kind === next.kind && jsonEqual(current.payload, next.payload)) return N(id);
      draft.nodes.set(id, next);
      return N(id);
    }
    case "setRoots": {
      if (!Array.isArray(action.roots)) reject("INVALID_ROOTS");
      const roots = action.roots.map(normalizeEndpoint);
      for (const root of roots) if (!endpointExists(draft, root)) reject("DANGLING_ROOT");
      const keys = roots.map(endpointKey);
      if (new Set(keys).size !== keys.length) reject("DUPLICATE_ROOT");
      draft.roots = roots;
      return roots;
    }
    case "reassert": {
      const oldId = requireId(action.id);
      const freshId = requireId(action.freshId);
      const relation = draft.relations.get(oldId);
      if (!relation) reject("MISSING_RELATION");
      if (draft.used.P.has(freshId)) reject("NO_RESURRECTION");
      const oldEndpoint = P(oldId);
      if (rootReferences(draft, oldEndpoint) || relationReferences(draft, oldEndpoint, oldId).length) reject("RELATION_REFERENCED");
      draft.used.P.add(freshId);
      draft.relations.set(freshId, {
        owner: normalizeEndpoint(relation.owner),
        label: normalizeLabel(relation.label),
        bound: relation.bound,
        target: relation.bound ? normalizeEndpoint(relation.target) : null
      });
      draft.relations.delete(oldId);
      return P(freshId);
    }
    default:
      reject("UNKNOWN_OPERATION");
  }
}

export function executeMO(state, action) {
  validateMOState(state);
  const draft = cloneMOState(state);
  try {
    const returnValue = applyAction(draft, action);
    validateMOState(draft);
    const delta = birthDeath(state, draft);
    const semanticChange = serializeLosslessMO(state) !== serializeLosslessMO(draft);
    return {
      state: draft,
      persistence: persistence(state, draft),
      outcome: { status: "OK", diagnostic: null, return: returnValue, semanticChange },
      ...delta
    };
  } catch (error) {
    if (!(error instanceof Reject)) throw error;
    return {
      state,
      persistence: identityPersistence(state),
      outcome: { status: "REJECT", diagnostic: error.diagnostic, return: null, semanticChange: false },
      born: { N: [], P: [] },
      dead: { N: [], P: [] }
    };
  }
}

export function executeMOSequence(state, actions) {
  let current = state;
  const history = [];
  for (const action of actions) {
    const transition = executeMO(current, action);
    history.push({ action: cloneJSON(action), persistence: transition.persistence, outcome: transition.outcome, born: transition.born, dead: transition.dead });
    current = transition.state;
    if (transition.outcome.status === "REJECT") break;
  }
  return { state: current, history };
}

export function executeMOAtomically(state, actions) {
  let current = state;
  const trace = [];
  for (const action of actions) {
    const transition = executeMO(current, action);
    trace.push({ action: cloneJSON(action), persistence: transition.persistence, outcome: transition.outcome, born: transition.born, dead: transition.dead });
    if (transition.outcome.status === "REJECT") {
      return {
        state,
        persistence: identityPersistence(state),
        outcome: { status: "REJECT", diagnostic: transition.outcome.diagnostic, return: null, semanticChange: false },
        born: { N: [], P: [] },
        dead: { N: [], P: [] },
        trace: []
      };
    }
    current = transition.state;
  }
  const delta = birthDeath(state, current);
  return {
    state: current,
    persistence: persistence(state, current),
    outcome: { status: "OK", diagnostic: null, return: null, semanticChange: serializeLosslessMO(state) !== serializeLosslessMO(current) },
    ...delta,
    trace
  };
}

function endpointJSON(endpoint) {
  return [endpoint.sort, endpoint.id];
}

function endpointFromJSON(value) {
  if (!Array.isArray(value) || value.length !== 2) reject("INVALID_SERIALIZATION");
  return value[0] === "N" ? N(value[1]) : value[0] === "P" ? P(value[1]) : reject("INVALID_SERIALIZATION");
}

export function losslessMOObject(state) {
  validateMOState(state);
  return {
    $mo: "np-state/1",
    nodes: [...state.nodes].sort(([a], [b]) => a.localeCompare(b)).map(([id, node]) => ({ id, kind: node.kind, payload: cloneJSON(node.payload) })),
    relations: [...state.relations].sort(([a], [b]) => a.localeCompare(b)).map(([id, relation]) => ({
      id,
      owner: endpointJSON(relation.owner),
      label: { kind: relation.label.kind, value: relation.label.value },
      bound: relation.bound,
      target: relation.bound ? endpointJSON(relation.target) : null
    })),
    roots: state.roots.map(endpointJSON),
    used: { N: [...state.used.N].sort(), P: [...state.used.P].sort() }
  };
}

export function serializeLosslessMO(state) {
  return JSON.stringify(losslessMOObject(state));
}

export function deserializeLosslessMO(value) {
  const obj = typeof value === "string" ? JSON.parse(value) : cloneJSON(value);
  if (!obj || obj.$mo !== "np-state/1" || !Array.isArray(obj.nodes) || !Array.isArray(obj.relations) || !Array.isArray(obj.roots) || !obj.used) reject("INVALID_SERIALIZATION");
  const state = createMOState();
  if (!Array.isArray(obj.used.N) || !Array.isArray(obj.used.P)) reject("INVALID_SERIALIZATION");
  for (const id of obj.used.N) state.used.N.add(requireId(id));
  for (const id of obj.used.P) state.used.P.add(requireId(id));
  for (const node of obj.nodes) {
    const id = requireId(node.id);
    if (state.nodes.has(id)) reject("INVALID_SERIALIZATION");
    state.nodes.set(id, normalizeNode(node.kind, node.payload));
  }
  for (const relation of obj.relations) {
    const id = requireId(relation.id);
    if (state.relations.has(id)) reject("INVALID_SERIALIZATION");
    const bound = Boolean(relation.bound);
    state.relations.set(id, {
      owner: endpointFromJSON(relation.owner),
      label: normalizeLabel(relation.label),
      bound,
      target: bound ? endpointFromJSON(relation.target) : null
    });
  }
  state.roots = obj.roots.map(endpointFromJSON);
  validateMOState(state);
  return state;
}
