import { cloneStrictJSON, requireDocumentId } from "./strict-json.js";
import { portError } from "./document-port-error.js";

/**
 * Materializes document values into an independent, mutable execution state.
 * A caller with access to this session may mutate getMutableDocument() values
 * directly; every explicit export is validated as strict JSON.
 *
 * Session mutations NEVER call reader.read(), writer.commit(), or a DBMS.
 * Source snapshot handles are used only during initial materialization.
 */
export async function createWorkingSession(reader, snapshot, documentIds) {
  if (!reader || typeof reader.read !== "function" || !Array.isArray(documentIds)) {
    throw portError("INVALID_REFERENCE", "Reader and documentIds are required");
  }
  if (documentIds.length > 10_000) {
    throw portError("RESOURCE_LIMIT", "Too many working documents");
  }
  const documents = new Map();
  for (const documentId of documentIds) {
    const id = requireDocumentId(documentId);
    if (documents.has(id)) {
      throw portError("INVALID_REFERENCE", "Duplicate working documentId");
    }
    // Even for a third-party provider returning shared objects, materialize an
    // independent tree. A failure never exposes a partially created session.
    documents.set(id, cloneStrictJSON(await reader.read(snapshot, id)));
  }
  function getMutableDocument(documentId) {
    const id = requireDocumentId(documentId);
    if (!documents.has(id)) {
      throw portError("NOT_FOUND", "Document is not part of this working session");
    }
    return documents.get(id);
  }
  return Object.freeze({
    getMutableDocument,
    replaceDocument(documentId, value) {
      const id = requireDocumentId(documentId);
      if (!documents.has(id)) {
        throw portError("NOT_FOUND", "Document is not part of this working session");
      }
      documents.set(id, cloneStrictJSON(value));
    },
    exportDocument(documentId) {
      return cloneStrictJSON(getMutableDocument(documentId));
    }
  });
}
