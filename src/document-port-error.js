/**
 * Stable error codes for DocumentPort/1. No provider-specific identifiers,
 * cryptographic internals or physical paths are included in the message.
 */
export class DocumentPortError extends Error {
  constructor(code, message) {
    super(message, { cause: undefined });
    this.name = "DocumentPortError";
    this.code = code;
  }
}

export function portError(code, message) {
  return new DocumentPortError(code, message);
}
