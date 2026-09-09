import type { FileBundle, FileManifest, FileOptions } from '../../shared/files';
export function zipSize(manifest: FileManifest, options?: { forceZip64?: boolean }): bigint;
export function zipChunks(bundle: FileBundle, options?: FileOptions & { forceZip64?: boolean }): AsyncIterable<Uint8Array>;
