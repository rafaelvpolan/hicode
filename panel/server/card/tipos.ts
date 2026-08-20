export { STATUSES } from '#shared/status'

export type Fields = Record<string, string>

export interface Parsed {
  fm: Fields
  order: string[]
  body: string
}

export interface Card extends Parsed {
  file: string
}
