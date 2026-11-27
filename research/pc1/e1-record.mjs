import { cloneJSON } from "../../src/mo-core.js";
import { deserializeE1State, losslessE1Object } from "./e1-witness.mjs";

function rejectRecord(diagnostic) {
  const error = new Error(diagnostic);
  error.name = "E1RecordReject";
  error.diagnostic = diagnostic;
  throw error;
}

function traceCopy(trace) {
  if (!Array.isArray(trace)) rejectRecord("INVALID_E1_TRACE");
  return cloneJSON(trace);
}

export function losslessE1Record(state, trace = []) {
  return {
    $record: "pc1-r2-e1-record/1",
    state: losslessE1Object(state),
    trace: traceCopy(trace)
  };
}

export function serializeE1Record(state, trace = []) {
  return JSON.stringify(losslessE1Record(state, trace));
}

export function deserializeE1Record(value) {
  const object = typeof value === "string" ? JSON.parse(value) : value;
  if (!object || object.$record !== "pc1-r2-e1-record/1" || !object.state || !Array.isArray(object.trace)) {
    rejectRecord("INVALID_E1_RECORD");
  }
  return {
    state: deserializeE1State(object.state),
    trace: traceCopy(object.trace)
  };
}
