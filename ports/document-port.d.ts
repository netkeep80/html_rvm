/**
 * DocumentPort/1 — DRAFT.
 * Neutral JSON document contract. No runtime implementation is supplied.
 * No dependency on HTML DBMS, relation model, browser or filesystem.
 */
export type JSONValue =
  | null | boolean | number | string
  | readonly JSONValue[]
  | { readonly [key: string]: JSONValue };

declare const snapshotBrand: unique symbol;

/**
 * Opaque provider-instance handle, not a portable locator and not authority
 * to write. Snapshot handles may become unavailable when provider closes.
 */
export interface SnapshotHandle {
  readonly [snapshotBrand]: true;
}

export type DocumentId = string;

export type JSONPatchOperation =
  | { readonly op: "add"; readonly path: string; readonly value: JSONValue }
  | { readonly op: "remove"; readonly path: string }
  | { readonly op: "replace"; readonly path: string; readonly value: JSONValue }
  | { readonly op: "move"; readonly from: string; readonly path: string }
  | { readonly op: "copy"; readonly from: string; readonly path: string }
  | { readonly op: "test"; readonly path: string; readonly value: JSONValue };

export interface DocumentChange {
  readonly documentId: DocumentId;
  readonly patch: readonly JSONPatchOperation[];
}

export type DocumentPortErrorCode =
  | "NOT_FOUND"
  | "INVALID_REFERENCE"
  | "SNAPSHOT_UNAVAILABLE"
  | "INTEGRITY_FAILURE"
  | "ACCESS_DENIED"
  | "INVALID_PATCH"
  | "CONFLICT"
  | "RESOURCE_LIMIT"
  | "UNSUPPORTED"
  | "INTERNAL";

export interface DocumentReader {
  /** Provider-specific locator. If omitted, capture provider's current version. */
  openSnapshot(reference?: string): Promise<SnapshotHandle>;

  /** Never mutates persistent state or exposes internal mutable references. */
  read(snapshot: SnapshotHandle, documentId: DocumentId): Promise<JSONValue>;
}

/**
 * Optional trusted-host capability. The RVM execution engine must not
 * implicitly acquire or invoke this writer.
 */
export interface DocumentWriter {
  /** Atomic multi-document CAS in provider scope; stale base => CONFLICT. */
  commit(
    base: SnapshotHandle,
    changes: readonly DocumentChange[]
  ): Promise<SnapshotHandle>;
}
