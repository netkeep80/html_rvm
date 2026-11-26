import {
  JSON_NODE_KINDS, N, P, Key, Index, cloneJSON, reject, normalizeEndpoint, sameEndpoint,
  normalizeNode, validateMOState, cloneMOState, createMOState, executeMO, executeMOAtomically, identityPersistence, sameLabel, jsonEqual
} from "./mo-core.js";

function outgoingStructural(state, nodeId) {
  const out = [];
  const owner = N(nodeId);
  for (const [id, relation] of state.relations) {
    if (!sameEndpoint(relation.owner, owner)) continue;
    if (relation.label.kind === "key" || relation.label.kind === "index") out.push([id, relation]);
  }
  return out;
}

export function projectPlainJSON(state, root = state.roots[0]) {
  validateMOState(state);
  if (!root) reject("JSON_ROOT_REQUIRED");
  root = normalizeEndpoint(root);
  if (root.sort !== "N" || !state.nodes.has(root.id)) reject("JSON_ROOT_NOT_NODE");
  const active = new Set();
  function visit(nodeId) {
    if (active.has(nodeId)) reject("JSON_CYCLE");
    const node = state.nodes.get(nodeId);
    if (!node || !JSON_NODE_KINDS.has(node.kind)) reject("JSON_UNSUPPORTED_NODE");
    const outgoing = outgoingStructural(state, nodeId);
    if (node.kind === "null" || node.kind === "boolean" || node.kind === "number" || node.kind === "string") {
      if (outgoing.length) reject("JSON_SCALAR_HAS_MEMBERS");
      return cloneJSON(node.payload);
    }
    active.add(nodeId);
    try {
      if (node.kind === "object") {
        if (outgoing.some(([, r]) => r.label.kind !== "key")) reject("JSON_LABEL_KIND");
        const seen = new Set();
        const entries = [];
        for (const [, relation] of outgoing) {
          if (!relation.bound) reject("JSON_UNBOUND_MEMBER");
          if (relation.target.sort !== "N") reject("JSON_RELATION_TARGET");
          const key = relation.label.value;
          if (seen.has(key)) reject("JSON_DUPLICATE_KEY");
          seen.add(key);
          entries.push([key, visit(relation.target.id)]);
        }
        entries.sort(([a], [b]) => a.localeCompare(b));
        return Object.fromEntries(entries);
      }
      if (outgoing.some(([, r]) => r.label.kind !== "index")) reject("JSON_LABEL_KIND");
      const byIndex = new Map();
      for (const [, relation] of outgoing) {
        if (!relation.bound) reject("JSON_UNBOUND_MEMBER");
        if (relation.target.sort !== "N") reject("JSON_RELATION_TARGET");
        const index = relation.label.value;
        if (byIndex.has(index)) reject("JSON_DUPLICATE_INDEX");
        byIndex.set(index, relation.target.id);
      }
      const indices = [...byIndex.keys()].sort((a, b) => a - b);
      if (indices.some((value, index) => value !== index)) reject("JSON_SPARSE_ARRAY");
      return indices.map(index => visit(byIndex.get(index)));
    } finally {
      active.delete(nodeId);
    }
  }
  return visit(root.id);
}

export class SequentialMOAllocator {
  constructor({ nodePrefix = "N$", relationPrefix = "P$", nodeCounter = 1, relationCounter = 1 } = {}) {
    this.nodePrefix = nodePrefix;
    this.relationPrefix = relationPrefix;
    this.nodeCounter = nodeCounter;
    this.relationCounter = relationCounter;
  }
  freshNode(state) {
    while (state.used.N.has(`${this.nodePrefix}${this.nodeCounter}`)) this.nodeCounter++;
    return `${this.nodePrefix}${this.nodeCounter++}`;
  }
  freshRelation(state) {
    while (state.used.P.has(`${this.relationPrefix}${this.relationCounter}`)) this.relationCounter++;
    return `${this.relationPrefix}${this.relationCounter++}`;
  }
}

function nodeActionForJSON(id, value) {
  if (value === null) return { op: "createNode", id, kind: "null", payload: null };
  if (typeof value === "boolean") return { op: "createNode", id, kind: "boolean", payload: value };
  if (typeof value === "number" && Number.isFinite(value)) return { op: "createNode", id, kind: "number", payload: value };
  if (typeof value === "string") return { op: "createNode", id, kind: "string", payload: value };
  if (Array.isArray(value)) return { op: "createNode", id, kind: "array" };
  if (value && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) return { op: "createNode", id, kind: "object" };
  reject("JSON_VALUE_INVALID");
}

function elaborateJSONSubtree(value, state, allocator) {
  value = cloneJSON(value);
  const actions = [];
  const reservations = cloneMOState(state);
  function build(current) {
    const nodeId = allocator.freshNode(reservations);
    reservations.used.N.add(nodeId);
    actions.push(nodeActionForJSON(nodeId, current));
    reservations.nodes.set(nodeId, normalizeNode(actions[actions.length - 1].kind, actions[actions.length - 1].payload));
    if (Array.isArray(current)) {
      current.forEach((child, index) => {
        const childId = build(child);
        const relationId = allocator.freshRelation(reservations);
        reservations.used.P.add(relationId);
        reservations.relations.set(relationId, { owner: N(nodeId), label: Index(index), bound: true, target: N(childId) });
        actions.push({ op: "createRelation", id: relationId, owner: N(nodeId), label: Index(index), target: N(childId) });
      });
    } else if (current && typeof current === "object") {
      for (const key of Object.keys(current).sort()) {
        const childId = build(current[key]);
        const relationId = allocator.freshRelation(reservations);
        reservations.used.P.add(relationId);
        reservations.relations.set(relationId, { owner: N(nodeId), label: Key(key), bound: true, target: N(childId) });
        actions.push({ op: "createRelation", id: relationId, owner: N(nodeId), label: Key(key), target: N(childId) });
      }
    }
    return nodeId;
  }
  const rootId = build(value);
  return { rootId, actions };
}

export function embedPlainJSON(value, { allocator = new SequentialMOAllocator() } = {}) {
  const state = createMOState();
  const plan = elaborateJSONSubtree(value, state, allocator);
  plan.actions.push({ op: "setRoots", roots: [N(plan.rootId)] });
  const transition = executeMOAtomically(state, plan.actions);
  if (transition.outcome.status !== "OK") reject("JSON_EMBED_FAILED", transition.outcome.diagnostic);
  return { state: transition.state, root: N(plan.rootId), trace: transition.trace };
}

function structuralReachable(state, root) {
  const nodes = new Set();
  const relations = new Set();
  const incoming = new Map();
  function visit(nodeId) {
    if (nodes.has(nodeId)) return;
    nodes.add(nodeId);
    for (const [id, relation] of outgoingStructural(state, nodeId)) {
      relations.add(id);
      if (!relation.bound || relation.target.sort !== "N") reject("JSON_NOT_CANONICAL_TREE");
      incoming.set(relation.target.id, (incoming.get(relation.target.id) ?? 0) + 1);
      visit(relation.target.id);
    }
  }
  visit(root.id);
  return { nodes, relations, incoming };
}

export function requireCanonicalJSONTree(state, root = state.roots[0]) {
  projectPlainJSON(state, root);
  root = normalizeEndpoint(root);
  if (state.roots.length !== 1 || root.sort !== "N" || !sameEndpoint(state.roots[0], root)) reject("JSON_NOT_CANONICAL_TREE");
  const reach = structuralReachable(state, root);
  if (reach.nodes.size !== state.nodes.size || reach.relations.size !== state.relations.size) reject("JSON_NOT_CANONICAL_TREE");
  for (const nodeId of reach.nodes) {
    if (nodeId === root.id) {
      if ((reach.incoming.get(nodeId) ?? 0) !== 0) reject("JSON_NOT_CANONICAL_TREE");
    } else if ((reach.incoming.get(nodeId) ?? 0) !== 1) {
      reject("JSON_NOT_CANONICAL_TREE");
    }
  }
  return true;
}

function findMember(state, ownerId, segment) {
  const expected = typeof segment === "string" ? Key(segment) : Number.isSafeInteger(segment) && segment >= 0 ? Index(segment) : reject("JSON_PATH_SEGMENT");
  const matches = outgoingStructural(state, ownerId).filter(([, relation]) => sameLabel(relation.label, expected));
  if (matches.length !== 1) reject(matches.length ? "JSON_AMBIGUOUS_PATH" : "JSON_PATH_NOT_FOUND");
  const [id, relation] = matches[0];
  if (!relation.bound || relation.target.sort !== "N") reject("JSON_PATH_NOT_FOUND");
  return { relationId: id, relation, targetId: relation.target.id };
}

function resolveJSONPath(state, root, path) {
  if (!Array.isArray(path)) reject("JSON_PATH_INVALID");
  let nodeId = root.id;
  let parent = null;
  for (const segment of path) {
    const node = state.nodes.get(nodeId);
    if (!node) reject("JSON_PATH_NOT_FOUND");
    if (typeof segment === "string" && node.kind !== "object") reject("JSON_PATH_TYPE");
    if (typeof segment === "number" && node.kind !== "array") reject("JSON_PATH_TYPE");
    const member = findMember(state, nodeId, segment);
    parent = { ownerId: nodeId, segment, ...member };
    nodeId = member.targetId;
  }
  return { nodeId, parent };
}

function deleteSubtreeActions(state, rootNodeId) {
  const actions = [];
  function remove(nodeId) {
    for (const [relationId, relation] of outgoingStructural(state, nodeId)) {
      if (!relation.bound || relation.target.sort !== "N") reject("JSON_NOT_CANONICAL_TREE");
      actions.push({ op: "deleteRelation", id: relationId });
      remove(relation.target.id);
    }
    actions.push({ op: "deleteNode", id: nodeId });
  }
  remove(rootNodeId);
  return actions;
}

function arrayLength(state, nodeId) {
  const relations = outgoingStructural(state, nodeId);
  const indices = relations.map(([, r]) => r.label.kind === "index" ? r.label.value : reject("JSON_LABEL_KIND")).sort((a, b) => a - b);
  if (indices.some((value, index) => value !== index)) reject("JSON_SPARSE_ARRAY");
  return indices.length;
}

function relationAtIndex(state, nodeId, index) {
  const matches = outgoingStructural(state, nodeId).filter(([, r]) => r.label.kind === "index" && r.label.value === index);
  if (matches.length !== 1) reject("JSON_PATH_NOT_FOUND");
  return matches[0][0];
}

export function applyJSONOperation(state, operation, { root = state.roots[0], allocator = new SequentialMOAllocator() } = {}) {
  validateMOState(state);
  requireCanonicalJSONTree(state, root);
  root = normalizeEndpoint(root);
  if (!operation || typeof operation !== "object" || !Array.isArray(operation.path)) reject("JSON_OPERATION_INVALID");
  const op = operation.op;
  if (!["add", "remove", "replace"].includes(op)) reject("JSON_OPERATION_INVALID");

  if (op === "replace") {
    const resolved = resolveJSONPath(state, root, operation.path);
    const currentValue = projectPlainJSON(state, N(resolved.nodeId));
    const nextValue = cloneJSON(operation.value);
    if (jsonEqual(currentValue, nextValue)) {
      return {
        state,
        persistence: identityPersistence(state),
        outcome: { status: "OK", diagnostic: null, return: null, semanticChange: false },
        born: { N: [], P: [] }, dead: { N: [], P: [] }, trace: []
      };
    }
    const subtree = elaborateJSONSubtree(nextValue, state, allocator);
    const actions = [...subtree.actions];
    if (operation.path.length === 0) {
      actions.push({ op: "setRoots", roots: [N(subtree.rootId)] });
      actions.push(...deleteSubtreeActions(state, root.id));
    } else {
      actions.push({ op: "rebindRelation", id: resolved.parent.relationId, target: N(subtree.rootId) });
      actions.push(...deleteSubtreeActions(state, resolved.nodeId));
    }
    return executeMOAtomically(state, actions);
  }

  if (operation.path.length === 0) reject("JSON_ROOT_MUTATION_UNSUPPORTED");
  const parentPath = operation.path.slice(0, -1);
  const segment = operation.path.at(-1);
  const parentResolved = resolveJSONPath(state, root, parentPath);
  const parentNode = state.nodes.get(parentResolved.nodeId);
  const actions = [];

  if (op === "remove") {
    if (typeof segment === "string") {
      if (parentNode.kind !== "object") reject("JSON_PATH_TYPE");
      const member = findMember(state, parentResolved.nodeId, segment);
      actions.push({ op: "deleteRelation", id: member.relationId });
      actions.push(...deleteSubtreeActions(state, member.targetId));
    } else {
      if (parentNode.kind !== "array" || !Number.isSafeInteger(segment) || segment < 0) reject("JSON_PATH_TYPE");
      const length = arrayLength(state, parentResolved.nodeId);
      if (segment >= length) reject("JSON_PATH_NOT_FOUND");
      const relationId = relationAtIndex(state, parentResolved.nodeId, segment);
      const targetId = state.relations.get(relationId).target.id;
      actions.push({ op: "deleteRelation", id: relationId });
      actions.push(...deleteSubtreeActions(state, targetId));
      for (let i = segment + 1; i < length; i++) actions.push({ op: "relabelRelation", id: relationAtIndex(state, parentResolved.nodeId, i), label: Index(i - 1) });
    }
    return executeMOAtomically(state, actions);
  }

  const subtree = elaborateJSONSubtree(operation.value, state, allocator);
  actions.push(...subtree.actions);
  const reservation = cloneMOState(state);
  for (const a of subtree.actions) {
    const t = executeMO(reservation, a);
    if (t.outcome.status !== "OK") reject("JSON_ELABORATION_FAILED");
    reservation.nodes = t.state.nodes; reservation.relations = t.state.relations; reservation.roots = t.state.roots; reservation.used = t.state.used;
  }
  const relationId = allocator.freshRelation(reservation);

  if (typeof segment === "string") {
    if (parentNode.kind !== "object") reject("JSON_PATH_TYPE");
    const existing = outgoingStructural(state, parentResolved.nodeId).some(([, r]) => r.label.kind === "key" && r.label.value === segment);
    if (existing) reject("JSON_KEY_EXISTS");
    actions.push({ op: "createRelation", id: relationId, owner: N(parentResolved.nodeId), label: Key(segment), target: N(subtree.rootId) });
  } else {
    if (parentNode.kind !== "array" || !Number.isSafeInteger(segment) || segment < 0) reject("JSON_PATH_TYPE");
    const length = arrayLength(state, parentResolved.nodeId);
    if (segment > length) reject("JSON_INDEX_RANGE");
    for (let i = length - 1; i >= segment; i--) actions.push({ op: "relabelRelation", id: relationAtIndex(state, parentResolved.nodeId, i), label: Index(i + 1) });
    actions.push({ op: "createRelation", id: relationId, owner: N(parentResolved.nodeId), label: Index(segment), target: N(subtree.rootId) });
  }
  return executeMOAtomically(state, actions);
}
