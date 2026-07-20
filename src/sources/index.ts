import {
  DEFAULT_SOURCE_ID,
  SOURCE_CONFIGURATIONS_STORE,
  requestToPromise,
  withStore,
} from '../db/client'
import { createIndexedDbSource } from './indexeddb-source'
import { sourceConfigurationSchema, type SourceConfiguration, type TaskSource } from './types'

export type { SourceConfiguration, IndexedDbSourceConfiguration, TaskSource } from './types'
export { createIndexedDbSource } from './indexeddb-source'

export const DEFAULT_SOURCE_CONFIG: SourceConfiguration = { kind: 'indexeddb', id: DEFAULT_SOURCE_ID }

export function buildSource(config: SourceConfiguration): TaskSource {
  switch (config.kind) {
    case 'indexeddb':
      return createIndexedDbSource(config)
    default: {
      const unknownKind: never = config.kind
      throw new Error(`Unknown source kind: ${String(unknownKind)}`)
    }
  }
}

export async function loadSourceConfigurations(): Promise<SourceConfiguration[]> {
  return withStore(SOURCE_CONFIGURATIONS_STORE, 'readonly', async (store) => {
    const raw = await requestToPromise(store.getAll())
    return raw.map((record) => sourceConfigurationSchema.parse(record))
  })
}

export function buildSourceRegistry(configs: SourceConfiguration[]): Map<string, TaskSource> {
  return new Map(configs.map((config) => [config.id, buildSource(config)]))
}
