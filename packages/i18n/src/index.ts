import { ptAO, type MessageKey } from "./pt-AO.ts";

export type { MessageKey };

/** Looks a message up in the pt-AO catalog. ICU plurals arrive with Task 0.8. */
export function t(key: MessageKey): string {
  return ptAO[key];
}

export const messageKeys = Object.keys(ptAO) as MessageKey[];
