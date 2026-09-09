import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'
import { projectRoot } from './run-command.mjs'

const APP_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/

export const BUILD_TARGETS = Object.freeze({
  ubuntu: Object.freeze({
    target: 'ubuntu',
    nitroPreset: 'node-server',
    runtimeKind: 'node',
  }),
  cloudflare: Object.freeze({
    target: 'cloudflare',
    nitroPreset: 'cloudflare_module',
    runtimeKind: 'cloudflare',
  }),
})

export function resolveBuildTarget(value) {
  const target = typeof value === 'string' && Object.hasOwn(BUILD_TARGETS, value) ? BUILD_TARGETS[value] : null
  if (!target) {
    throw new TypeError(`Unknown build target: ${String(value)}. Expected ubuntu or cloudflare.`)
  }
  return target
}

export function normalizeAppVersion(value) {
  if (typeof value !== 'string') throw new TypeError('App version must be a string')
  const normalized = value.trim()
  if (!APP_VERSION_PATTERN.test(normalized)) {
    throw new TypeError('App version must contain 1-64 safe version characters')
  }
  return normalized
}

export function outputPaths(rootDir = projectRoot) {
  const outputDir = resolve(rootDir, '.output')
  return {
    outputDir,
    serverEntry: resolve(outputDir, 'server', 'index.mjs'),
    publicDir: resolve(outputDir, 'public'),
    metadataFile: resolve(outputDir, 'build-meta.json'),
  }
}

export async function assertBuildArtifacts(rootDir = projectRoot) {
  const paths = outputPaths(rootDir)
  await access(paths.serverEntry, constants.R_OK)
  const publicStats = await stat(paths.publicDir)
  if (!publicStats.isDirectory()) throw new Error('.output/public is not a directory')
  return paths
}

export async function writeBuildMetadata(targetName, options = {}) {
  const target = resolveBuildTarget(targetName)
  const paths = outputPaths(options.rootDir)
  const appVersion = normalizeAppVersion(options.appVersion ?? '0.1.0')
  const builtAtDate = (options.now ?? (() => new Date()))()
  if (!(builtAtDate instanceof Date) || Number.isNaN(builtAtDate.getTime())) {
    throw new TypeError('Build metadata clock must return a valid Date')
  }

  await mkdir(paths.outputDir, { recursive: true })
  const metadata = {
    schemaVersion: 1,
    project: 'academic-cms',
    target: target.target,
    nitroPreset: target.nitroPreset,
    runtimeKind: target.runtimeKind,
    appVersion,
    builtAt: builtAtDate.toISOString(),
  }

  const temporaryFile = `${paths.metadataFile}.${process.pid}.tmp`
  try {
    await writeFile(temporaryFile, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
    await rename(temporaryFile, paths.metadataFile)
  } finally {
    await rm(temporaryFile, { force: true })
  }
  return metadata
}

export async function readBuildMetadata(rootDir = projectRoot) {
  const { metadataFile } = outputPaths(rootDir)
  let parsed
  try {
    parsed = JSON.parse(await readFile(metadataFile, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read valid build metadata at ${metadataFile}`, { cause: error })
  }

  const declaredTarget = typeof parsed?.target === 'string' && Object.hasOwn(BUILD_TARGETS, parsed.target) ? BUILD_TARGETS[parsed.target] : null
  const builtAt = typeof parsed?.builtAt === 'string' ? new Date(parsed.builtAt) : null
  if (
    parsed?.schemaVersion !== 1
    || parsed?.project !== 'academic-cms'
    || !declaredTarget
    || parsed?.nitroPreset !== declaredTarget.nitroPreset
    || parsed?.runtimeKind !== declaredTarget.runtimeKind
    || typeof parsed?.appVersion !== 'string'
    || !APP_VERSION_PATTERN.test(parsed.appVersion)
    || !builtAt
    || Number.isNaN(builtAt.getTime())
    || builtAt.toISOString() !== parsed.builtAt
  ) {
    throw new Error(`Malformed build metadata at ${metadataFile}`)
  }
  return parsed
}

export async function assertBuildTarget(expectedTarget, rootDir = projectRoot) {
  const expected = resolveBuildTarget(expectedTarget)
  await assertBuildArtifacts(rootDir)
  const metadata = await readBuildMetadata(rootDir)
  if (metadata.target !== expected.target) {
    throw new Error(
      `Build target mismatch: expected ${expected.target}/${expected.nitroPreset}/${expected.runtimeKind}, `
      + `received ${metadata.target}/${metadata.nitroPreset}/${metadata.runtimeKind}`,
    )
  }
  return metadata
}
