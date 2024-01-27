import fs from 'node:fs/promises'
import path from 'node:path'
import { convert, programNodeNames } from './convert-iife.mjs'
import { sizesToString, stringSizeGzip, writeFileAndPrintSizes } from './file-size.mjs'
import { convertAndRemoveDeadCode, splitWith1stMode } from './split-esm.mjs'

/**
 * @typedef { import('./file-size.mjs').FileWithSizes } FileWithSizes
 */

/**
 * @param {string} filePath
 * @param {import('./types/public.js').SideEffects} effects
 * @returns {Promise<import('./types/public.js').SplitResult>}
 */
export async function splitPerProgramWithSingleSharedData(filePath, effects) {
    const data = await prepareSplit(filePath, effects)
    switch (data.result) {
        case 'error':
        case 'esm-dce':
            return data

        case 'can-split':
            return splitWith1stMode({
                input: data.input,
                outDir: path.dirname(filePath),
                basename: path.basename(filePath, path.extname(filePath)) + '.split',
                programNodes: data.programNodes,
                esm: data.esm,
                effects,
            })

        default:
            // @ts-expect-error `data.result` should never occur
            const msg = `Unexpected \`readAndConvert\` result: ${data.result}`
            console.error(msg, data)
            throw new Error(msg)
    }
}

/**
 * @typedef {import('./types/public.js').Error
 * | { result: 'can-split',
 *     input: FileWithSizes,
 *     esm: string,
 *     programNodes: Array<import('./convert-iife.mjs').ProgramNode>
 * }
 * | import('./types/public.js').SingleEsm
 * } ReadAndConvert
 *
 * @param {string} filePath
 * @param {import('./types/public.js').SideEffects} effects
 * @returns {Promise<ReadAndConvert>}
 */
async function prepareSplit(filePath, effects) {
    const iife = await fs.readFile(filePath, 'utf-8')
    if (effects.printLogs) {
        console.log(`Working in directory ${path.dirname(filePath)}`)
    }
    const before = await stringSizeGzip(iife)
    if (effects.printLogs) {
        console.log(`Read ${path.basename(filePath)} ${sizesToString(before)}`)
    }
    /** @type FileWithSizes */
    const input = { file: filePath, sizes: before }

    try {
        const { esm, programNodes } = convert(iife)
        if (programNodes.length < 1) {
            throw new Error(`Could not extract a main program from '${filePath}'`)
        } else if (programNodes.length === 1) {
            console.warn('Did not split the file because it contains only one program.')
            const esm = convertAndRemoveDeadCode(iife)
            const newEsm = `// Converted from ${filePath}\n` + esm
            const output = await writeFileAndPrintSizes(filePath + '.dce.mjs', newEsm, effects)
            return { result: 'esm-dce', input, programs: programNodeNames(programNodes), output }
        } else {
            return { result: 'can-split', input, esm, programNodes }
        }
    } catch (ex /** @type {unknown | Error} */) {
        console.error(ex)
        return {
            result: 'error',
            input,
            message: ex instanceof Error ? ex.message : String(ex),
        }
    }
}
