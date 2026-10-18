import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MemoryRepository } from './MemoryRepository.js'

/** Small durable adapter for the prototype; replace with a database for production. */
export class JsonFileRepository extends MemoryRepository {
  constructor(filePath = join(dirname(fileURLToPath(import.meta.url)), '../../.data/store.json')) {
    super()
    this.filePath = filePath
    this.load()
  }

  persist() {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const temporaryPath = `${this.filePath}.tmp`
      writeFileSync(temporaryPath, JSON.stringify({
        transfers: this.transfers,
        beneficiaries: this.beneficiaries,
        virtualAccountDeposits: this.virtualAccountDeposits,
        seenWebhookEvents: [...this.seenWebhookEvents],
      }, null, 2))
      renameSync(temporaryPath, this.filePath)
    } catch (error) {
      console.warn('[repository] persistance locale impossible :', error.message)
    }
  }

  load() {
    try {
      if (!existsSync(this.filePath)) return
      const data = JSON.parse(readFileSync(this.filePath, 'utf8'))
      for (const key of ['transfers', 'beneficiaries', 'virtualAccountDeposits']) {
        if (Array.isArray(data[key])) this[key] = data[key]
      }
      if (Array.isArray(data.seenWebhookEvents)) this.seenWebhookEvents = new Set(data.seenWebhookEvents)
    } catch (error) {
      console.warn('[repository] rechargement local impossible :', error.message)
    }
  }
}
