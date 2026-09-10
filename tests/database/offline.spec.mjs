import { test } from 'node:test'
import { createHarness, load } from '../helpers/offline-db.mjs'
const { contractCases } = load('tests/contracts/repository-contract.js')
for (const kind of ['sqlite', 'd1-protocol-double']) {
  for (const contract of contractCases) {
    test(`${kind}: ${contract.name}`, async () => {
      const harness = createHarness(kind === 'sqlite' ? 'sqlite' : 'd1')
      try { await contract.run(harness) }
      finally { harness.close() }
    })
  }
}
