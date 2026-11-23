import { cloneStrictJSON, requireDocumentId } from "./strict-json.js";
import { portError } from "./document-port-error.js";

/**
 * Small read-only in-memory implementation of DocumentPort/1.
 *
 * Only one logical version ("initial") is supported. Handle authority is
 * runtime-enforced by a private WeakMap, NOT by its visible object shape.
 * No DocumentWriter, filesystem or HTML DBMS dependency exists.
 */
export class MemoryDocumentProvider {
  #documents = new Map();
  #handles = new WeakMap();

  constructor(documents = {}) {
    if (documents === null || typeof documents !== "object" ||
        Array.isArray(documents) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(documents))) {
      throw portError("INVALID_REFERENCE", "Document collection must be a JSON object");
    }
    const keys = Reflect.ownKeys(documents);
    if (keys.length > 10_000) {
      throw portError("RESOURCE_LIMIT", "Too many documents");
    }
    for (const id of keys) {
      requireDocumentId(id);
      const descriptor = Object.getOwnPropertyDescriptor(documents, id);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
        throw portError("INVALID_REFERENCE", "Invalid document collection entry");
      }
      this.#documents.set(id, cloneStrictJSON(descriptor.value));
    }
  }

  async openSnapshot(reference) {
    if (reference !== undefined) {
      if (typeof reference !== "string" || reference.length === 0) {
        throw portError("INVALID_REFERENCE", "Invalid snapshot locator");
      }
      if (reference !== "initial") {
        throw portError("SNAPSHOT_UNAVAILABLE", "Snapshot is unavailable");
      }
    }
    const handle = Object.freeze(Object.create(null));
    this.#handles.set(handle, this.#documents);
    return handle;
  }

  async read(snapshot, documentId) {
    if (snapshot === null || typeof snapshot !== "object" || !this.#handles.has(snapshot)) {
      throw portError("INVALID_REFERENCE", "Snapshot handle is invalid for this provider");
    }
    const id = requireDocumentId(documentId);
    const documents = this.#handles.get(snapshot);
    if (!documents.has(id)) {
      throw portError("NOT_FOUND", "Document does not exist in this snapshot");
    }
    return cloneStrictJSON(documents.get(id));
  }
}
