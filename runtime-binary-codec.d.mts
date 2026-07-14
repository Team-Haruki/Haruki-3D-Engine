export const runtimeBinaryArrayExtensionType: number;

export type RuntimeNumericArray = number[] | Float32Array | Uint16Array | Uint32Array;

export function decodeRuntimeMessagePack(bytes: ArrayLike<number> | ArrayBufferView | ArrayBuffer): unknown;
