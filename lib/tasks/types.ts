import type { Fields } from '../card'

export interface ExternalTask {
  externalId: string
  title: string
  body: string
}

export interface TaskSync {
  readonly name: string
  pull(): Promise<ExternalTask[]>
  push(card: Fields): Promise<void>
}
