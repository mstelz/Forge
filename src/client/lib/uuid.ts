import { v4 as uuidv4_lib } from "uuid";

/**
 * Generates a UUID v4.
 * 
 * Uses the industry-standard 'uuid' library which automatically uses
 * crypto.randomUUID() when available (Secure Contexts) and falls back
 * to crypto.getRandomValues() or other sources when it is not.
 */
export function uuidv4(): string {
  return uuidv4_lib();
}
