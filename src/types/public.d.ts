import { FileWithSizes } from '../file-size.mjs'

export type SideEffects = {
    // if false, no output is logged to stdout
    printLogs: boolean
    // if false, no files are written
    writeFiles: boolean
}

export type SplitResult = Error | SingleEsm | ManyProgramsWithSingleShared

export type Error = Result<'error', { message: string; input?: FileWithSizes }>

// TODO decide on one way to define a `Result`
export type SingleEsm = Result<
    'esm-dce',
    {
        input: FileWithSizes
        programs: Array<string>
        output: FileWithSizes
    }
>

export type ManyProgramsWithSingleShared = {
    result: 'split-programs-one-shared'
    programs: ReadonlyArray<string>
    input: Readonly<FileWithSizes>
    output: { programs: ReadonlyArray<FileWithSizes>; shared: Readonly<FileWithSizes> }
}

export type Result<literal, T> = { result: readonly literal } & readonly T
