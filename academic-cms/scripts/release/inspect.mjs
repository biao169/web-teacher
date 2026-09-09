import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { projectRoot } from '../lib/run-command.mjs'
import { inspectEnvironment } from './environment.mjs'
import { sourceIdentity } from './inputs.mjs'

const report = { generatedAt: new Date().toISOString(), ...(await inspectEnvironment(projectRoot)), source: await sourceIdentity(projectRoot) }
const directory = resolve(projectRoot, 'reports/stage10b')
await mkdir(directory, { recursive: true })
await writeFile(resolve(directory, 'environment.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ status: report.status, node: report.node, blockers: report.blockers }, null, 2))
process.exitCode = report.blockers.length ? 2 : 0
