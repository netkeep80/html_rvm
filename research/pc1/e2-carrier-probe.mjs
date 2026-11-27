const ROLES = Object.freeze(["E", "O", "R", "S"]);

function fail(code, message = code) {
  const e = new Error(message);
  e.name = "E2Reject";
  e.diagnostic = code;
  throw e;
}

function requireId(id) {
  if (typeof id !== "string" || id.length === 0 || id.includes("\0")) fail("INVALID_ID");
  return id;
}

function requireRole(role) {
  if (!ROLES.includes(role)) fail("INVALID_ROLE");
  return role;
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function evidenceTrace(entries) {
  return deepFreeze(deepCopy(entries));
}

function decodePointerToken(token) {
  if (/~(?:[^01]|$)/.test(token)) fail("INVALID_CONTEXT_PATH");
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function aRef(ref) {
  return { kind: ref.kind, id: ref.id };
}

// A — JS/JSON-near control. Object identity is native JS identity; explicit ids are
// retained only so a lossless JSON reference table can reconstruct sharing/cycles.
export class JsonNearCarrier {
  constructor() {
    this.atoms = new Map();
    this.duplets = new Map();
    this.frames = new Map();
    this.usedFrameIds = new Set();
  }

  atom(id, value = id) {
    requireId(id);
    if (this.atoms.has(id) || this.duplets.has(id)) fail("DUPLICATE_ID");
    const ref = { kind: "atom", id, value: deepCopy(value), members: Object.create(null) };
    this.atoms.set(id, ref);
    return ref;
  }

  ref(id) {
    return this.atoms.get(id) ?? this.duplets.get(id) ?? fail("MISSING_REF");
  }

  duplet(id, begin, end) {
    requireId(id);
    if (this.atoms.has(id) || this.duplets.has(id)) fail("DUPLICATE_ID");
    const ref = { kind: "duplet", id, begin, end };
    this.duplets.set(id, ref);
    return ref;
  }

  readDuplet(id) {
    const d = this.duplets.get(id);
    if (!d) fail("MISSING_DUPLET");
    return d;
  }

  reattach(id, begin) {
    this.readDuplet(id).begin = begin;
  }

  rebind(id, end) {
    this.readDuplet(id).end = end;
  }

  member(owner, key, slot) {
    if (!owner || owner.kind !== "atom" || typeof owner.value !== "object" || owner.value === null || Array.isArray(owner.value)) {
      fail("MEMBER_OWNER_NOT_OBJECT");
    }
    if (typeof key !== "string") fail("INVALID_MEMBER_KEY");
    if (!slot || slot.kind !== "duplet") fail("INVALID_SLOT");
    owner.members[key] = slot;
  }

  createFrame(id, { parent = null, E, O, R, S }) {
    requireId(id);
    if (this.usedFrameIds.has(id)) fail("FRAME_NO_RESURRECTION");
    if (parent !== null && !this.frames.has(parent.id)) fail("MISSING_PARENT");
    const roles = { E, O, R, S };
    for (const role of ROLES) if (!roles[role] || roles[role].kind !== "duplet") fail("INVALID_SLOT");
    const frame = { id, parent, roles };
    this.frames.set(id, frame);
    this.usedFrameIds.add(id);
    return frame;
  }

  frame(id) {
    return this.frames.get(id) ?? fail("MISSING_FRAME");
  }

  roleSlot(frame, role) {
    return frame.roles[requireRole(role)];
  }

  roleValue(frame, role) {
    return this.roleSlot(frame, role).end;
  }

  depth(frame) {
    let n = 0;
    for (let p = frame.parent; p; p = p.parent) n += 1;
    return n;
  }

  resolve(frame, path) {
    const m = /^(\$\$?)(rel|obj|sub|ent)\/(.*)$/.exec(path);
    if (!m) fail("EXPLICIT_CONTEXT_ROOT_REQUIRED");
    let f = frame;
    if (m[1] === "$$") {
      if (!f.parent) fail("MISSING_PARENT");
      f = f.parent;
    }
    const map = { ent: "E", obj: "O", rel: "R", sub: "S" };
    let current = this.roleValue(f, map[m[2]]);
    let slot = null;
    for (const segment of m[3].split("/").map(decodePointerToken)) {
      if (!current || current.kind !== "atom") fail("MISSING_CONTEXT_PATH");
      slot = current.members[segment];
      if (!slot) fail("MISSING_CONTEXT_PATH");
      current = slot.end;
    }
    return slot;
  }

  H(frame, path, id) {
    const routed = this.resolve(frame, path);
    return this.createFrame(id, {
      parent: frame.parent,
      E: frame.roles.E,
      O: frame.roles.O,
      R: routed,
      S: frame.roles.S
    });
  }

  HObserved(frame, path, id) {
    const routed = this.resolve(frame, path);
    const next = this.H(frame, path, id);
    return {
      frame: next,
      trace: evidenceTrace([{ op: "H", from: frame.id, to: next.id, path, routed: routed.id }])
    };
  }

  V(frame, modelSlot, id, { O = null, S = null } = {}) {
    return this.createFrame(id, {
      parent: frame,
      E: modelSlot,
      O: O ?? frame.roles.R,
      R: frame.roles.R,
      S: S ?? frame.roles.R
    });
  }

  VObserved(frame, modelSlot, id, { O = null, S = null } = {}) {
    const next = this.V(frame, modelSlot, id, { O, S });
    return {
      frame: next,
      trace: evidenceTrace([{
        op: "V",
        from: frame.id,
        to: next.id,
        modelSlot: modelSlot.id,
        O: next.roles.O.id,
        S: next.roles.S.id
      }])
    };
  }

  Q(frame, steps) {
    if (!Array.isArray(steps)) return { status: "REJECT", diagnostic: "INVALID_Q_STEPS", trace: evidenceTrace([]) };
    const prepared = [];
    try {
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        if (!step || step.op !== "rebindRole") fail("INVALID_Q_STEP");
        const role = requireRole(step.role);
        if (!step.target || !["atom", "duplet"].includes(step.target.kind)) fail("INVALID_ENDPOINT");
        requireId(step.target.id);
        prepared.push({ index, role, slot: frame.roles[role], target: step.target });
      }
    } catch (e) {
      if (e?.diagnostic) return { status: "REJECT", diagnostic: e.diagnostic, trace: evidenceTrace([]) };
      throw e;
    }
    const trace = [];
    for (const p of prepared) {
      const exists = this.atoms.get(p.target.id) === p.target || this.duplets.get(p.target.id) === p.target;
      if (!exists) {
        trace.push({
          index: p.index,
          op: "rebindRole",
          role: p.role,
          slot: p.slot.id,
          target: aRef(p.target),
          outcome: { status: "REJECT", diagnostic: "MISSING_TARGET", semanticChange: false }
        });
        return { status: "REJECT", diagnostic: "MISSING_TARGET", trace: evidenceTrace(trace) };
      }
      const semanticChange = p.slot.end !== p.target;
      p.slot.end = p.target;
      trace.push({
        index: p.index,
        op: "rebindRole",
        role: p.role,
        slot: p.slot.id,
        target: aRef(p.target),
        outcome: { status: "OK", diagnostic: null, semanticChange }
      });
    }
    return { status: "OK", diagnostic: null, trace: evidenceTrace(trace) };
  }

  classifyWrites(writes) {
    const bySlot = new Map();
    const normalized = writes.map(w => ({ frame: w.frame, role: w.role ?? "R", slot: w.frame.roles[requireRole(w.role ?? "R")], target: w.target }));
    for (const w of normalized) {
      const prior = bySlot.get(w.slot);
      if (!prior) bySlot.set(w.slot, w);
      else if (prior.target !== w.target) return { status: "ALIAS_CONFLICT", writes: normalized };
    }
    return { status: "DISJOINT_OR_COINCIDENT", writes: normalized };
  }

  commitWrites(writes) {
    const c = this.classifyWrites(writes);
    if (c.status === "ALIAS_CONFLICT") return { status: "REJECT", diagnostic: "ALIAS_CONFLICT", writes: c.writes };
    for (const w of c.writes) w.slot.end = w.target;
    return { status: "OK", diagnostic: null, writes: c.writes };
  }

  factorBundle(entries, { preserveOccurrenceIdentity = true } = {}) {
    if (!Array.isArray(entries)) fail("INVALID_BUNDLE");
    const seen = new Set();
    const normalized = entries.map(e => {
      requireId(e?.id);
      if (seen.has(e.id)) fail("DUPLICATE_BUNDLE_ID");
      seen.add(e.id);
      for (const x of [e.R,e.O,e.S]) if (!x || !["atom","duplet"].includes(x.kind)) fail("INVALID_ENDPOINT");
      return { id:e.id, R:e.R, O:e.O, S:e.S };
    });
    const byR = new Map();
    let nonfunctional = null;
    let identity = null;
    const table = [];
    for (const e of normalized) {
      let byO = byR.get(e.R);
      if (!byO) { byO = new Map(); byR.set(e.R, byO); }
      const prior = byO.get(e.O);
      if (!prior) { byO.set(e.O,e); table.push(e); }
      else if (prior.S !== e.S) nonfunctional ??= [prior.id,e.id];
      else if (preserveOccurrenceIdentity) identity ??= [prior.id,e.id];
    }
    if (nonfunctional) return {status:"NON_FUNCTIONAL",entries:normalized,conflict:nonfunctional};
    if (identity) return {status:"FALLBACK_IDENTITY",entries:normalized,conflict:identity};
    return {status:"FACTORIZED",entries:normalized,table:table.map(({R,O,S})=>({R,O,S}))};
  }

  serializeLossless() {
    const ref = x => ({ kind: x.kind, id: x.id });
    return JSON.stringify({
      $carrier: "pc1-r2-e2-a/1",
      atoms: [...this.atoms.values()].map(a => ({
        id: a.id,
        value: deepCopy(a.value),
        members: Object.entries(a.members).map(([key, slot]) => [key, slot.id])
      })),
      duplets: [...this.duplets.values()].map(d => ({ id: d.id, begin: ref(d.begin), end: ref(d.end) })),
      frames: [...this.frames.values()].map(f => ({
        id: f.id,
        parent: f.parent?.id ?? null,
        roles: Object.fromEntries(ROLES.map(r => [r, f.roles[r].id]))
      })),
      usedFrameIds: [...this.usedFrameIds]
    });
  }

  static deserializeLossless(text) {
    const o = typeof text === "string" ? JSON.parse(text) : text;
    if (!o || o.$carrier !== "pc1-r2-e2-a/1") fail("INVALID_SERIALIZATION");
    const c = new JsonNearCarrier();
    for (const a of o.atoms) c.atom(a.id, a.value);
    const resolve = r => c.ref(r.id);
    // Duplets may be cyclic. Allocate shells first, then wire references.
    for (const d of o.duplets) {
      requireId(d.id);
      if (c.atoms.has(d.id) || c.duplets.has(d.id)) fail("DUPLICATE_ID");
      c.duplets.set(d.id, { kind: "duplet", id: d.id, begin: null, end: null });
    }
    for (const d of o.duplets) {
      const target = c.duplets.get(d.id);
      target.begin = resolve(d.begin);
      target.end = resolve(d.end);
    }
    for (const a of o.atoms) {
      const owner = c.atoms.get(a.id);
      for (const [key, slotId] of a.members) owner.members[key] = c.readDuplet(slotId);
    }
    c.usedFrameIds = new Set(o.usedFrameIds);
    for (const f of o.frames) {
      c.frames.set(f.id, { id: f.id, parent: null, roles: Object.fromEntries(ROLES.map(r => [r, c.readDuplet(f.roles[r])])) });
    }
    for (const f of o.frames) if (f.parent !== null) c.frames.get(f.id).parent = c.frames.get(f.parent) ?? fail("MISSING_PARENT");
    return c;
  }

  serializeRecord(trace) {
    return JSON.stringify({
      $record: "pc1-r2-e2-a-record/2",
      state: JSON.parse(this.serializeLossless()),
      trace: deepCopy(trace)
    });
  }

  static deserializeRecord(text) {
    const o = typeof text === "string" ? JSON.parse(text) : text;
    if (!o || o.$record !== "pc1-r2-e2-a-record/2" || !Array.isArray(o.trace)) fail("INVALID_RECORD");
    return { state: JsonNearCarrier.deserializeLossless(o.state), trace: evidenceTrace(o.trace) };
  }
}

// C — homogeneous pair topology. Every graph endpoint is an index into pairs.
// JSON scalar payload is intentionally external side metadata attached to atom
// carrier occurrences; all structural references remain pair indices.
export class DupletArrayCarrier {
  constructor() {
    this.pairs = [null]; // 1-based occurrence identity, index 0 is invalid
    this.atomPayload = new Map();
    this.internal = Object.create(null);
    this.internal.null = this.atom({ $e2: "null" });
    this.internal.member = this.atom({ $e2: "member" });
    this.internal.nil = this.atom({ $e2: "nil" });
  }

  exists(i) {
    return Number.isSafeInteger(i) && i > 0 && i < this.pairs.length && Array.isArray(this.pairs[i]);
  }

  requireHandle(i, diagnostic = "INVALID_HANDLE") {
    if (!Number.isSafeInteger(i) || i <= 0) fail(diagnostic);
    return i;
  }

  requireExisting(i, diagnostic = "MISSING_HANDLE") {
    this.requireHandle(i, diagnostic);
    if (!this.exists(i)) fail(diagnostic);
    return i;
  }

  atom(payload) {
    const i = this.pairs.length;
    this.pairs.push([i, i]);
    this.atomPayload.set(i, deepCopy(payload));
    return i;
  }

  isAtom(i) {
    return this.atomPayload.has(i);
  }

  isDuplet(i) {
    return this.exists(i) && !this.isAtom(i);
  }

  requireDuplet(i, diagnostic = "MISSING_DUPLET") {
    this.requireExisting(i, diagnostic);
    if (this.isAtom(i)) fail(diagnostic);
    return i;
  }

  validateState() {
    for (let i = 1; i < this.pairs.length; i += 1) {
      const pair = this.pairs[i];
      if (pair === null) continue;
      if (!Array.isArray(pair) || pair.length !== 2) fail("INVALID_PAIR_STATE");
      this.requireExisting(pair[0], "DANGLING_PAIR_ENDPOINT");
      this.requireExisting(pair[1], "DANGLING_PAIR_ENDPOINT");
    }
    for (const [id] of this.atomPayload) {
      this.requireExisting(id, "INVALID_ATOM_CARRIER");
      const [a, b] = this.pairs[id];
      if (a !== id || b !== id) fail("INVALID_ATOM_CARRIER");
    }
    for (const k of ["null", "member", "nil"]) {
      const id = this.internal[k];
      this.requireExisting(id, "INVALID_INTERNAL_ROOT");
      if (!this.isAtom(id)) fail("INVALID_INTERNAL_ROOT");
    }
    return true;
  }

  payload(i) {
    this.requireExisting(i);
    if (!this.atomPayload.has(i)) fail("NOT_ATOM");
    return deepCopy(this.atomPayload.get(i));
  }

  duplet(begin, end) {
    this.requireExisting(begin, "MISSING_BEGIN");
    this.requireExisting(end, "MISSING_END");
    const i = this.pairs.length;
    this.pairs.push([begin, end]);
    return i;
  }

  read(i) {
    this.requireExisting(i);
    return { id: i, begin: this.pairs[i][0], end: this.pairs[i][1] };
  }

  reattach(i, begin) {
    this.requireDuplet(i, "MISSING_DUPLET");
    this.requireExisting(begin, "MISSING_BEGIN");
    this.pairs[i][0] = begin;
    this.validateState();
    return i;
  }

  rebind(i, end) {
    this.requireDuplet(i, "MISSING_DUPLET");
    this.requireExisting(end, "MISSING_END");
    this.pairs[i][1] = end;
    this.validateState();
    return i;
  }

  deleteDuplet(i) {
    this.requireDuplet(i, "MISSING_DUPLET");
    for (let j = 1; j < this.pairs.length; j += 1) {
      if (j === i || this.pairs[j] === null) continue;
      const [begin, end] = this.pairs[j];
      if (begin === i || end === i) fail("DUPLET_STILL_REFERENCED");
    }
    this.pairs[i] = null;
    this.validateState();
    return i;
  }

  // Object membership is graph topology:
  // kv=[keyAtom,slot], tagged=[MEMBER,kv], edge=[owner,tagged].
  member(owner, key, slot) {
    this.requireExisting(owner, "MISSING_MEMBER_OWNER");
    if (!this.isAtom(owner)) fail("MEMBER_OWNER_NOT_ATOM");
    this.requireDuplet(slot, "MISSING_SLOT");
    const keyAtom = this.atom(String(key));
    const kv = this.duplet(keyAtom, slot);
    const tagged = this.duplet(this.internal.member, kv);
    return this.duplet(owner, tagged);
  }

  resolveMember(owner, key) {
    this.requireExisting(owner, "MISSING_MEMBER_OWNER");
    const matches = [];
    for (let edge = 1; edge < this.pairs.length; edge += 1) {
      if (this.isAtom(edge)) continue;
      const [b, tagged] = this.pairs[edge];
      if (b !== owner || !this.exists(tagged) || this.isAtom(tagged)) continue;
      const [tag, kv] = this.pairs[tagged];
      if (tag !== this.internal.member || !this.exists(kv) || this.isAtom(kv)) continue;
      const [keyAtom, slot] = this.pairs[kv];
      if (!this.isAtom(keyAtom)) continue;
      if (this.payload(keyAtom) === String(key)) matches.push(slot);
    }
    if (matches.length === 0) fail("MISSING_CONTEXT_PATH");
    if (matches.length !== 1) fail("AMBIGUOUS_CONTEXT_PATH");
    return matches[0];
  }

  // Frame structure is entirely pair topology:
  // eo=[Eslot,Oslot], rs=[Rslot,Sslot], roles=[eo,rs], frame=[parent,roles].
  // A raw pair can exist without being an admitted frame. Every operation that
  // interprets a pair as a frame re-validates this bounded shape before writing.
  frameShape(frame, seen = new Set()) {
    this.requireDuplet(frame, "INVALID_FRAME");
    if (seen.has(frame)) fail("FRAME_PARENT_CYCLE");
    seen.add(frame);

    const [parent, roles] = this.pairs[frame];
    this.requireDuplet(roles, "INVALID_FRAME_SHAPE");
    const [eo, rs] = this.pairs[roles];
    this.requireDuplet(eo, "INVALID_FRAME_SHAPE");
    this.requireDuplet(rs, "INVALID_FRAME_SHAPE");

    const [E, O] = this.pairs[eo];
    const [R, S] = this.pairs[rs];

    let parentShape = null;
    if (parent === this.internal.null) {
      this.requireExisting(parent, "MISSING_PARENT");
    } else {
      parentShape = this.frameShape(parent, seen);
    }

    const structural = new Set([frame, roles, eo, rs]);
    if (parentShape) for (const id of parentShape.structural) structural.add(id);

    for (const slot of [E, O, R, S]) {
      this.requireDuplet(slot, "INVALID_FRAME_SLOT");
      if (structural.has(slot)) fail("INVALID_FRAME_SLOT");
    }

    return {
      frame,
      parent,
      roles,
      eo,
      rs,
      E,
      O,
      R,
      S,
      depth: parentShape ? parentShape.depth + 1 : 0,
      structural
    };
  }

  createFrame({ parent = this.internal.null, E, O, R, S }) {
    let parentShape = null;
    if (parent === this.internal.null) this.requireExisting(parent, "MISSING_PARENT");
    else parentShape = this.frameShape(parent);

    for (const slot of [E, O, R, S]) {
      this.requireDuplet(slot, "INVALID_FRAME_SLOT");
      if (parentShape?.structural.has(slot)) fail("INVALID_FRAME_SLOT");
    }

    const eo = this.duplet(E, O);
    const rs = this.duplet(R, S);
    const roles = this.duplet(eo, rs);
    return this.duplet(parent, roles);
  }

  parent(frame) {
    return this.frameShape(frame).parent;
  }

  frameRoles(frame) {
    const shape = this.frameShape(frame);
    return { E: shape.E, O: shape.O, R: shape.R, S: shape.S };
  }

  roleSlot(frame, role) {
    const shape = this.frameShape(frame);
    return shape[requireRole(role)];
  }

  roleValue(frame, role) {
    return this.read(this.roleSlot(frame, role)).end;
  }

  depth(frame) {
    return this.frameShape(frame).depth;
  }

  resolve(frame, path) {
    const m = /^(\$\$?)(rel|obj|sub|ent)\/(.*)$/.exec(path);
    if (!m) fail("EXPLICIT_CONTEXT_ROOT_REQUIRED");
    let f = frame;
    if (m[1] === "$$") {
      f = this.parent(frame);
      if (f === this.internal.null) fail("MISSING_PARENT");
    }
    const map = { ent: "E", obj: "O", rel: "R", sub: "S" };
    let slot = this.roleSlot(f, map[m[2]]);
    let owner = this.read(slot).end;
    for (const segment of m[3].split("/").map(decodePointerToken)) {
      slot = this.resolveMember(owner, segment);
      owner = this.read(slot).end;
    }
    return slot;
  }

  H(frame, path) {
    const source = this.frameRoles(frame);
    const routed = this.resolve(frame, path);
    return this.createFrame({ parent: this.parent(frame), E: source.E, O: source.O, R: routed, S: source.S });
  }

  HObserved(frame, path) {
    const routed = this.resolve(frame, path);
    const next = this.H(frame, path);
    return { frame: next, trace: evidenceTrace([{ op: "H", from: frame, to: next, path, routed }]) };
  }

  V(frame, modelSlot, { O = null, S = null } = {}) {
    const source = this.frameRoles(frame);
    this.requireDuplet(modelSlot, "MISSING_MODEL_SLOT");
    if (O !== null) this.requireDuplet(O, "MISSING_O_SLOT");
    if (S !== null) this.requireDuplet(S, "MISSING_S_SLOT");
    return this.createFrame({ parent: frame, E: modelSlot, O: O ?? source.R, R: source.R, S: S ?? source.R });
  }

  VObserved(frame, modelSlot, { O = null, S = null } = {}) {
    const next = this.V(frame, modelSlot, { O, S });
    const roles = this.frameRoles(next);
    return {
      frame: next,
      trace: evidenceTrace([{
        op: "V",
        from: frame,
        to: next,
        modelSlot,
        O: roles.O,
        S: roles.S
      }])
    };
  }

  Q(frame, steps) {
    if (!Array.isArray(steps)) return { status: "REJECT", diagnostic: "INVALID_Q_STEPS", trace: evidenceTrace([]) };
    const prepared = [];
    try {
      const shape = this.frameShape(frame);
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        if (!step || step.op !== "rebindRole") fail("INVALID_Q_STEP");
        const role = requireRole(step.role);
        this.requireHandle(step.target, "INVALID_ENDPOINT");
        const slot = shape[role];
        this.requireDuplet(slot, "INVALID_FRAME_SLOT");
        prepared.push({ index, role, slot, target: step.target });
      }
    } catch (e) {
      if (e?.diagnostic) return { status: "REJECT", diagnostic: e.diagnostic, trace: evidenceTrace([]) };
      throw e;
    }
    const trace = [];
    for (const p of prepared) {
      if (!this.exists(p.target)) {
        trace.push({
          index: p.index,
          op: "rebindRole",
          role: p.role,
          slot: p.slot,
          target: p.target,
          outcome: { status: "REJECT", diagnostic: "MISSING_TARGET", semanticChange: false }
        });
        return { status: "REJECT", diagnostic: "MISSING_TARGET", trace: evidenceTrace(trace) };
      }
      const semanticChange = this.pairs[p.slot][1] !== p.target;
      this.pairs[p.slot][1] = p.target;
      trace.push({
        index: p.index,
        op: "rebindRole",
        role: p.role,
        slot: p.slot,
        target: p.target,
        outcome: { status: "OK", diagnostic: null, semanticChange }
      });
    }
    this.validateState();
    return { status: "OK", diagnostic: null, trace: evidenceTrace(trace) };
  }

  classifyWrites(writes) {
    if (!Array.isArray(writes)) fail("INVALID_BRANCH_WRITES");
    const normalized = writes.map(w => {
      if (!w || typeof w !== "object") fail("INVALID_BRANCH_WRITE");
      const shape = this.frameShape(w.frame);
      const role = requireRole(w.role ?? "R");
      this.requireExisting(w.target, "MISSING_TARGET");
      const slot = shape[role];
      this.requireDuplet(slot, "INVALID_FRAME_SLOT");
      return { frame: w.frame, role, slot, target: w.target };
    });
    const bySlot = new Map();
    for (const w of normalized) {
      const prior = bySlot.get(w.slot);
      if (!prior) bySlot.set(w.slot, w);
      else if (prior.target !== w.target) return { status: "ALIAS_CONFLICT", writes: normalized };
    }
    return { status: "DISJOINT_OR_COINCIDENT", writes: normalized };
  }

  commitWrites(writes) {
    let classification;
    try {
      classification = this.classifyWrites(writes);
    } catch (e) {
      if (e?.diagnostic) return { status: "REJECT", diagnostic: e.diagnostic, writes: [] };
      throw e;
    }
    if (classification.status === "ALIAS_CONFLICT") return { status: "REJECT", diagnostic: "ALIAS_CONFLICT", writes: classification.writes };
    for (const w of classification.writes) this.pairs[w.slot][1] = w.target;
    this.validateState();
    return { status: "OK", diagnostic: null, writes: classification.writes };
  }

  createBundle(entries) {
    if (!Array.isArray(entries)) fail("INVALID_BUNDLE");
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") fail("INVALID_BUNDLE_ENTRY");
      for (const x of [entry.R, entry.O, entry.S]) this.requireExisting(x, "INVALID_ENDPOINT");
    }
    const occurrences = entries.map(({ R, O, S }) => {
      const ro = this.duplet(R, O);
      return this.duplet(ro, S);
    });
    let head = this.internal.nil;
    for (let i = occurrences.length - 1; i >= 0; i -= 1) head = this.duplet(occurrences[i], head);
    return { head, occurrences };
  }

  bundleEntries(head) {
    const out = [];
    const seen = new Set();
    let p = head;
    while (p !== this.internal.nil) {
      this.requireExisting(p, "INVALID_BUNDLE_CHAIN");
      if (seen.has(p)) fail("BUNDLE_ORDER_CYCLE");
      seen.add(p);
      const cell = this.read(p);
      const entry = cell.begin;
      const ep = this.read(entry);
      const ro = this.read(ep.begin);
      out.push({ id: entry, R: ro.begin, O: ro.end, S: ep.end });
      p = cell.end;
    }
    return out;
  }

  factorBundle(head, { preserveOccurrenceIdentity = true } = {}) {
    const entries = this.bundleEntries(head);
    const table = new Map();
    let nonfunctional = null;
    let identity = null;
    for (const e of entries) {
      const key = JSON.stringify([e.R, e.O]);
      const prior = table.get(key);
      if (!prior) table.set(key, e);
      else if (prior.S !== e.S) nonfunctional ??= [prior.id, e.id];
      else if (preserveOccurrenceIdentity) identity ??= [prior.id, e.id];
    }
    if (nonfunctional) return { status: "NON_FUNCTIONAL", entries, conflict: nonfunctional };
    if (identity) return { status: "FALLBACK_IDENTITY", entries, conflict: identity };
    return { status: "FACTORIZED", entries, table: [...table.values()].map(({ R, O, S }) => ({ R, O, S })) };
  }

  serializeLossless() {
    this.validateState();
    return JSON.stringify({
      $carrier: "pc1-r2-e2-c/2",
      pairs: this.pairs.slice(1).map(p => p === null ? null : [...p]),
      atomPayload: [...this.atomPayload].map(([id, value]) => [id, deepCopy(value)]),
      internal: { ...this.internal }
    });
  }

  static deserializeLossless(text) {
    const o = typeof text === "string" ? JSON.parse(text) : text;
    if (!o || o.$carrier !== "pc1-r2-e2-c/2" || !Array.isArray(o.pairs) || !Array.isArray(o.atomPayload)) fail("INVALID_SERIALIZATION");
    const c = Object.create(DupletArrayCarrier.prototype);
    c.pairs = [null, ...o.pairs.map(p => p === null ? null : [p[0], p[1]])];
    c.atomPayload = new Map(o.atomPayload.map(([id, value]) => [id, deepCopy(value)]));
    c.internal = { ...o.internal };
    c.validateState();
    return c;
  }

  serializeRecord(trace) {
    return JSON.stringify({ $record: "pc1-r2-e2-c-record/2", state: JSON.parse(this.serializeLossless()), trace: deepCopy(trace) });
  }

  static deserializeRecord(text) {
    const o = typeof text === "string" ? JSON.parse(text) : text;
    if (!o || o.$record !== "pc1-r2-e2-c-record/2" || !Array.isArray(o.trace)) fail("INVALID_RECORD");
    return { state: DupletArrayCarrier.deserializeLossless(o.state), trace: evidenceTrace(o.trace) };
  }
}

export const E2_LEDGER_C = Object.freeze([
  ["duplet occurrence identity", "CARRIER-PRIMITIVE", "append-only pair index is lifetime identity; deleted indices are tombstones and are never reused"],
  ["endpoint topology and recovery", "DUPLET-DERIVED", "relative to the declared live-pair domain, endpoints are ordered pair indices"],
  ["stable identity under endpoint rebind/reattach", "CARRIER-PRIMITIVE", "only non-atom live duplets are mutable; mutation preserves the allocated index"],
  ["shared vs distinct equal-valued duplets", "DUPLET-DERIVED", "sharing is equality of occurrence indices; equal pair values do not collapse"],
  ["self and mutual cycles", "DUPLET-DERIVED", "live non-atom pair endpoints may reference live pair occurrences"],
  ["frame E/O/R/S structure", "DUPLET-DERIVED", "relative to the declared frame shape, nested pair topology encodes the role-slot tuple"],
  ["frame parent ancestry", "DUPLET-DERIVED", "relative to the frame shape and null bootstrap root, frame begin points to parent occurrence"],
  ["role-carrier alias partition", "DUPLET-DERIVED", "within the declared frame shape, roles alias iff tuple leaves contain the same slot index"],
  ["object membership topology", "DUPLET-DERIVED", "relative to the atom boundary and member bootstrap tag, owner/key/slot incidence is pair topology"],
  ["JSON scalar payload and member-key text", "SIDE-METADATA", "opaque scalar/key values remain attached to atom carrier occurrences"],
  ["fresh occurrence allocation", "CARRIER-PRIMITIVE", "append-only allocation creates a lifetime identity; deleted indices are not reused"],
  ["H path resolution and transition", "CARRIER-PRIMITIVE", "runtime routing policy operates over declared member/frame shapes; object-key JSON-pointer tokens are admitted, array-index typing is outside E2"],
  ["V fresh-child transition", "CARRIER-PRIMITIVE", "runtime allocates a fresh frame and applies inheritance/default rules"],
  ["Q sequential execution/failure boundary", "CARRIER-PRIMITIVE", "runtime sequencing, semanticChange observation, prefix commit and suffix stop are operational rules"],
  ["alias-conflict rejection policy", "CARRIER-PRIMITIVE", "topology exposes the same slot; rejection policy is operational"],
  ["bundle occurrence identity and order", "DUPLET-DERIVED", "relative to the nil bootstrap and cons/entry shape, occurrence indices and chain encode multiplicity/order"],
  ["bundle functional predicate", "DUPLET-DERIVED", "functional/non-functional classification is computed from decoded R/O/S topology and endpoint identities"],
  ["bundle identity-fallback disposition", "CARRIER-PRIMITIVE", "FACTORIZED vs FALLBACK_IDENTITY for equal duplicate occurrences additionally depends on preserveOccurrenceIdentity policy"],
  ["lossless structural state", "DUPLET-DERIVED", "for validated admitted states, pair array plus declared shape/root conventions reconstructs graph identity/topology exactly"],
  ["atom/bootstrap reconstruction", "SIDE-METADATA", "payload table and internal null/member/nil root handles accompany the pair array"],
  ["ordered execution trace", "EVIDENCE-ONLY", "immutable identity-based observations are serialized separately from semantic state"]
]);

export const E2_LEDGER_QUALIFICATION_C = Object.freeze({
  derivedMeans: "derivable from validated pair topology relative to declared atom/bootstrap roots and shape conventions, not standalone untyped self-description",
  contextualAddressing: "E2 admits E1 object-key JSON-pointer token decoding (~0, ~1, including empty keys); array-index typing remains outside the W1-W8 correspondence subset",
  duplicateObjectKeys: "duplicate object-key ambiguity is outside admitted E2 correspondence domain; no unrestricted E1 object-member equivalence is claimed for the JS/JSON-near A control",
  frameInterpretation: "raw pair topology may cease to satisfy the bounded frame shape after legal topology edits; every operation that interprets a pair as a frame must revalidate shape before mutation",
  deletion: "non-atom duplet deletion is admitted only when no other live pair references the occurrence; allocation is append-only and deleted indices are never reused"
});

export const E2_DISPOSITION_CANDIDATE = "NO_SELECTION / MORE_EVIDENCE_REQUIRED";
