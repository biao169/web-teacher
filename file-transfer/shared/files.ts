export interface ManifestEntry { relativePath: string; kind: 'file' | 'directory'; sizeBytes: string; modifiedAt: number | null }
export interface FileManifest { version: 1; entries: ManifestEntry[] }
export interface FileBundle { manifest: FileManifest; sources: Map<string, (signal?: AbortSignal) => AsyncIterable<Uint8Array>>; warnings: string[]; renamed: { from: string; to: string }[] }
export interface FileStats { files: number; directories: number; emptyDirectories: number; totalBytes: string; entries: number }
export interface FileProgress { bytes: string; totalBytes: string; path: string }
export interface SaveResult { status: 'saved' | 'download-requested'; name: string; files?: number; bytes?: string }
export interface FileOptions { signal?: AbortSignal | undefined; onProgress?: ((progress: FileProgress) => void) | undefined }
export interface FileProblem { code: string; path?: string; partialDirectory?: string; completedFiles?: number }
export interface ReadHandle { name: string; kind: 'file' | 'directory'; values(): AsyncIterable<ReadHandle>; getFile(): Promise<File> }
export interface PickerScope { isSecureContext: boolean; showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<ReadHandle>; showSaveFilePicker?: (...args: unknown[]) => Promise<unknown> }
