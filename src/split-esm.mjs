import fs from 'node:fs/promises'
import path from 'node:path'
import { jsParser } from './js-parser.mjs'
import { getDeclarationsAndDependencies, getDependenciesOf } from './dependency-graph.mjs'
import { convert, exportsToString, programNodeNames } from './convert-iife.mjs'
import { writeFileAndPrintSizes } from './file-size.mjs'

/**
 * @typedef { import('tree-sitter').SyntaxNode} SyntaxNode
 * @typedef { import('./convert-iife.mjs').ProgramNode} ProgramNode
 *
 * @typedef {{ startIndex: number, endIndex: number, needs: Array<string>, replacedContent?: string }} Chunk
 */

/**
 * @param {import("fs").PathLike | fs.FileHandle} input
 * @returns
 */
export async function wipAnalyze(input) {
    const iife = await fs.readFile(input, 'utf-8')
    const esm = convertAndRemoveDeadCode(iife)
    let newEsm = `// extracted from ${input}\n` + esm
    await writeFileAndPrintSizes(input + '.dce.mjs', newEsm, { printLogs: true, writeFiles: false })

    return {
        iifeByteSize: byteSize(iife),
        iifeChars: iife.length,
        esmByteSize: byteSize(newEsm),
        esmChars: newEsm.length,
    }
}

/**
 * @param {string} string
 * @returns {number} length of string in byte
 */
function byteSize(string) {
    return new TextEncoder().encode(string).length
}

/**
 * @param {string} iife compiled Elm js file
 * @returns {string}
 */
export function convertAndRemoveDeadCode(iife) {
    const { esm, programNodes } = convert(iife)
    const map = getDeclarationsAndDependencies(esm)

    const deps = new Set()
    programNodes.forEach(n => getDependenciesOf(n.name, map).forEach(deps.add, deps))

    let strings = dependenciesToChunks(deps, map.declarations, map.unnamed).map(chunkToString(esm))

    strings.push(exportsToString(programNodes))

    return strings.join('\n') + '\n'
}

/**
 * @param {Set<string>} deps
 * @param {import('./dependency-graph.mjs').DependencyMap} declarations
 * @param {Array<Chunk>} chunks additional chunks to insert (e.g. unnamed declarations or side effects)
 * @returns {Array<Chunk>}
 */
export function dependenciesToChunks(deps, declarations, chunks) {
    return (
        fetchChunksForDependencies(deps, declarations)
            .concat(...chunks)
            // sort deps by occurrence in Elm file
            .sort((a, b) => a.startIndex - b.startIndex)
    )
}

/**
 * @param {Set<string>} deps
 * @param {import('./dependency-graph.mjs').DependencyMap} map
 * @returns {Array<Chunk>}
 */
function fetchChunksForDependencies(deps, map) {
    return Array.from(deps, key => {
        const value = map.get(key)
        if (!value) throw new Error(`Could not find dependency '${key}' in map`)
        const replacedContent = replacements.get(key)
        return { replacedContent, ...value }
    })
}

/**
 *
 * @param {string} esm
 * @returns {(chunk:Chunk) => string}
 */
function chunkToString(esm) {
    return chunk => {
        if (chunk.replacedContent) return chunk.replacedContent
        else return esm.substring(chunk?.startIndex ?? 0, chunk?.endIndex ?? 0)
    }
}

/**
 * For some function calls it is important that the global window context is passed.
 * Otherwise it leads to an `Illegal invocation` error.
 * `requestAnimationFrame` and `cancelAnimationFrame` for instance.
 * @type { Map<string,string> }
 **/
const replacements = new Map()
replacements.set(
    '_Browser_requestAnimationFrame',
    'var _Browser_requestAnimationFrame = window.requestAnimationFrame.bind(window)',
)
replacements.set(
    '_Browser_cancelAnimationFrame',
    'var _Browser_cancelAnimationFrame = window.cancelAnimationFrame.bind(window)',
)

/**
 * Splits the `esm` code into one file per Elm program.
 * Each imports the shared code from `${basename}.split.shared.mjs` and exports only one Elm program.
 *
 * The global code that creates side effects is also copied into the shared file.
 *
 * @param {{
 *  input: import('./file-size.mjs').FileWithSizes,
 *  outDir: string,
 *  basename: string,
 *  programNodes: Array<ProgramNode>,
 *  esm: string
 *  effects: import('./types/public.js').SideEffects
 * }} param
 * @returns {Promise<import('./types/public.js').ManyProgramsWithSingleShared>}
 */
export async function splitWith1stMode({ input, outDir, basename, programNodes, esm, effects }) {
    const files = []
    const map = getDeclarationsAndDependencies(esm)

    const programs = programNodes.map(n => ({
        name: n.name,
        init: n.init,
        needs: getDependenciesOf(n.name, map),
        // keeping track of the shared dependencies so I can replace them later
        shared: new Set(),
    }))
    const shared = new Set(map.unnamed.flatMap(({ needs }) => needs))

    transformStateForSplitMode1({ programs, shared })

    /** @type {(deps: Set<string>, chunks?: Array<Chunk>) => string } */
    const depsToString = (deps, chunks = []) =>
        dependenciesToChunks(deps, map.declarations, chunks).map(chunkToString(esm)).join('\n') +
        '\n'

    // also inserts the unnamed code
    let sharedCode = depsToString(shared, map.unnamed)
    sharedCode += `export { ${Array.from(shared).join(', ')} };\n`

    const sharedLib = 'shared'
    const sharedFilename = `${basename}.${sharedLib}.mjs`
    const dest = path.join(outDir, sharedFilename)
    const sharedFile = writeFileAndPrintSizes(dest, sharedCode, effects)

    for (const program of programs) {
        if (effects.printLogs) {
            console.log('Extracting', program.name)
        }
        let orig = depsToString(program.needs) + exportsToString([program])

        const tree = jsParser.parse(orig)
        const identifiers = tree.rootNode
            .descendantsOfType('identifier')
            .filter(node => shared.has(node.text))

        let code = `import * as ${sharedLib} from './${sharedFilename}';\n`
        let lastIndex = 0
        for (const identifier of identifiers) {
            code += orig.substring(lastIndex, identifier.startIndex) + sharedLib + '.'
            lastIndex = identifier.startIndex
        }
        code += orig.substring(lastIndex) + '\n'

        const dest = path.join(outDir, `${basename}.${program.name}.mjs`)
        files.push(writeFileAndPrintSizes(dest, code, effects))
    }

    return {
        result: 'split-programs-one-shared',
        input,
        programs: programNodeNames(programNodes),
        output: {
            shared: await sharedFile,
            programs: await Promise.all(files),
        },
    }
}

/**
 * Removes common dependencies from the `programs` and adds them to `shared`.
 *
 * @typedef {ProgramNode & { needs: Set<string>, shared: Set<string> }} SplitMode1Program
 *
 * @param {{ programs: Array<SplitMode1Program>, shared: Set<string> }} data
 * @returns {void}
 */
export function transformStateForSplitMode1({ programs, shared }) {
    // compare all needed dependencies between all programs
    for (let index = 0; index < programs.length; index++) {
        const a = programs[index]
        for (const s of shared.values()) {
            if (a.needs.delete(s)) a.shared.add(s)
        }
        // compare to all other programs
        for (let b of programs.slice(index + 1)) {
            a.needs.forEach(need => {
                if (elementsToAlwaysShare.includes(need)) {
                    shared.add(need)
                    a.shared.add(need)
                }
                if (b.needs.has(need)) {
                    shared.add(need)
                    a.shared.add(need)
                    // reduce the amount of work needed when/if `b` is reached in outer loop
                    b.needs.delete(need)
                    b.shared.add(need)
                } else if (b.shared.has(need)) {
                    a.shared.add(need)
                }
            })
            // not sure how the set behaves if I would remove entries while iterating over it
            // so deleting from a comes at the end
            a.shared.forEach(n => a.needs.delete(n))
        }
    }
}

const elementsToAlwaysShare = [
    // this is re-assigned by `Browser.Document` programs and needs to live next to the `stepperBuilder` passed to `_Platform_initialize`
    '_VirtualDom_divertHrefToApp',
    '_Platform_initialize',
    '_Browser_document',
    '_Debugger_document',
    '_VirtualDom_render',
]
