export type EventHandler = (...args: unknown[]) => void;

function looksLikeJsonValue(value: string): boolean {
  return (
    (value.startsWith('{') && value.endsWith('}')) ||
    (value.startsWith('[') && value.endsWith(']')) ||
    (value.startsWith('"') && value.endsWith('"'))
  );
}

export function parseRealtimeData(data: unknown): unknown {
  if (typeof data !== 'string' || data.length === 0 || !looksLikeJsonValue(data)) {
    return data;
  }

  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

export function serializeRealtimeData(data: unknown): string {
  if (data != null && typeof data === 'object') {
    return JSON.stringify(data);
  }
  if (typeof data === 'string') {
    return data;
  }
  return String(data);
}
