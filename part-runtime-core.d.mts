export function mergePartRuntimeCore<T extends Record<string, unknown>>(
  delta: T & { corePath?: string; warnings?: string[] },
  core: Record<string, unknown> & { warnings?: string[] }
): T;
