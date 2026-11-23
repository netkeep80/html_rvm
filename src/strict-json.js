import { portError } from "./document-port-error.js";

/**
 * Copy strictly JSON-representable values without invoking toJSON/getters.
 * Reject objects which cannot be safely represented as JSON.
 * Limits prevent unbounded recursion and oversized untrusted input trees.
 *
 * This validates provider boundaries / explicit working-state exports, not
 * individual trusted in-memory operations performed by an RVM interpreter.
 */
export function cloneStrictJSON(value, { maxDepth = 128, maxNodes = 100_000 } = {}) {
  let visited = 0;
  const active = new WeakSet();
  function clone(node, depth) {
    if (depth > maxDepth || ++visited > maxNodes) {
      throw portError("RESOURCE_LIMIT", "JSON traversal exceeds configured limits");
    }
    if (node === null || typeof node === "boolean" || typeof node === "string") {
      return node;
    }
    if (typeof node === "number") {
      if (!Number.isFinite(node)) {
        throw portError("INVALID_REFERENCE", "JSON number must be finite");
      }
      return node;
    }
    if (typeof node !== "object") {
      throw portError("INVALID_REFERENCE", "Value is outside the strict JSON domain");
    }
    const isArray = Array.isArray(node);
    const prototype = Object.getPrototypeOf(node);
    if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      throw portError("INVALID_REFERENCE", "Non-JSON object prototype");
    }
    if (active.has(node)) {
      throw portError("INVALID_REFERENCE", "Cyclic JSON value");
    }
    active.add(node);
    try {
      const keys = Reflect.ownKeys(node);
      if (isArray) {
        if (node.length > maxNodes || keys.length !== node.length + 1) {
          throw portError("RESOURCE_LIMIT", "Array size exceeds configured limits or has extra keys");
        }
        const out = new Array(node.length);
        for (let index = 0; index < node.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(node, String(index));
          if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
            throw portError("INVALID_REFERENCE", "Sparse or accessor-backed JSON array");
          }
          out[index] = clone(descriptor.value, depth + 1);
        }
        if (keys.some(key => typeof key !== "string" || (key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key)))) {
          throw portError("INVALID_REFERENCE", "Invalid JSON array property");
        }
        return out;
      }
      const out = {};
      for (const key of keys) {
        if (typeof key !== "string") {
          throw portError("INVALID_REFERENCE", "JSON object has a symbol key");
        }
        const descriptor = Object.getOwnPropertyDescriptor(node, key);
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
          throw portError("INVALID_REFERENCE", "Non-data or non-enumerable JSON property");
        }
        Object.defineProperty(out, key, {
          value: clone(descriptor.value, depth + 1),
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
      return out;
    } finally {
      active.delete(node);
    }
  }
  return clone(value, 0);
}

export function requireDocumentId(id) {
  if (typeof id !== "string" || id.length === 0 || id.length > 1024 || id.includes("\0")) {
    throw portError("INVALID_REFERENCE", "Invalid documentId");
  }
  return id;
}
