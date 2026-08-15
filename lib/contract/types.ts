export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export type RepoShape = 'single' | 'workspaces' | 'poly'

export interface PackageInfo {
  name: string
  path: string
  framework: string
  language: string
  packageManager: PackageManager
  scripts: string[]
  devPort: number
  commands: Commands
}

export interface Commands {
  install: string
  build: string
  test: string
  lint: string
  typecheck: string
  dev: string
}

export interface ContractSource {
  kind: 'repo'
  ref: string
  hash: string
}

export interface Contract {
  version: 1
  generated: string
  hash: string
  shape: RepoShape
  packageManager: PackageManager
  monorepo: boolean
  main: string
  packages: PackageInfo[]
  stack: string
  commands: Commands
  sources: ContractSource[]
}
