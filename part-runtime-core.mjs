export function mergePartRuntimeCore(delta, core) {
  const { corePath: _corePath, warnings: deltaWarnings, ...variant } = delta;
  return {
    ...core,
    ...variant,
    warnings: [...(core.warnings ?? []), ...(deltaWarnings ?? [])],
  };
}
