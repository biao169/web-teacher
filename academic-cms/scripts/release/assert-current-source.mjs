import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { sourceIdentity } from './inputs.mjs'
export async function assertCurrentBuildSource(root) {
  const proof=JSON.parse(await readFile(resolve(root,'.output/source-proof.json'),'utf8'))
  if(proof.schemaVersion!==1 || proof.sourceDigest !== (await sourceIdentity(root)).digest) throw new Error('Build source changed; rebuild instead of reusing stale output')
  return proof
}
