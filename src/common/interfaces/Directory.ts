import { ConfigFile } from './ConfigFile'

export type DirectoryFile = {
  directory: boolean
  set?: ConfigFile
  file: string
}

export type Directory = DirectoryFile[]
