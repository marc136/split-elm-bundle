import fs from 'node:fs/promises'
import path from 'node:path';
import { jsParser } from './js-parser.mjs';
import { getDeclarationsAndDependencies, getDependenciesOf } from './dependency-graph.mjs';

/**
 * @typedef { import('tree-sitter').SyntaxNode} SyntaxNode
 */

/**
 * @param {import("fs").PathLike | fs.FileHandle} input
 * @param {import("fs").PathLike | fs.FileHandle} output
 */
export async function convertFile(input, output) {
    const iife = await fs.readFile(input, 'utf-8')
    const { esm } = convert(iife)
    await fs.writeFile(output, esm, 'utf-8')
}

/**
 * @param {string} iife compiled Elm js file
 * @returns {{esm: string, programNodes: Array<{ name: string, init: SyntaxNode }>}}
 */
export function convert(iife) {
    // `function F` is always exported first by the compiler
    const start = iife.indexOf('function F')
    // and the `_Platform_export` is always last in the file
    const platformExportIndex = iife.lastIndexOf('_Platform_export(')
    // between those is our main code, which we want to copy

    // and the object passed to `_Platform_export` contains all Elm programs
    // which we will parse to export each program separately
    // With tree-sitter we can ignore that we have the injection of global this at the very end
    const programNodes = parsePlatformExport(iife.substring(iife.indexOf('{', platformExportIndex)))

    const esm = iife.substring(start, platformExportIndex) + '\n' + exportsToString(programNodes)

    return { esm, programNodes }
}

/**
 * 
 * @param {string} iife compiled Elm js file
 * @returns {string}
 */
export function convertAndRemoveDeadCode(iife) {
    let result = ''
    const { esm, programNodes } = convert(iife)
    const map = getDeclarationsAndDependencies(esm)

    const deps = new Set()
    programNodes.forEach(n =>
        getDependenciesOf(n.name, map).forEach(deps.add, deps)
    )

    let strings = Array.from(deps, key => map.declarations.get(key))
        .filter(val => !!val)
        .concat(...map.unnamed)
        // sort deps by occurrence in Elm file
        .sort((a, b) => a.startIndex - b.startIndex)
        // then copy only those chunks into a new file
        .map(chunk => esm.substring(chunk.startIndex, chunk.endIndex))

    strings.push(exportsToString(programNodes))

    // then I can diff the output
    // and check if the new file still works
    return strings.join('\n') + '\n'
}

/**
 * 
 * @param {Array<ProgramNode>} programNodes
 * @returns {string}
 */
function exportsToString(programNodes) {
    return [
        programNodes.map(program => `export const ${program.name} = { init: ${program.init.text} };`).join('\n'),
        `export const Elm = { ${programNodes.map(program => program.name).join(', ')} };`,
        'export default Elm;'].join('\n')
}

/**
 * @typedef {{ name: string, init: SyntaxNode }} ProgramNode
 * @typedef Chunk
 * @prop {number} startIndex
 * @prop {number} endIndex
 * @prop {Array<string>} needs
 * 
 * @typedef {{ outDir: string, basename: string, programNodes: Array<ProgramNode>, esm: string }} SplitMode1
 * @typedef { ProgramNode & { needs: Set<string>, shared: Set<string> }} SplitMode1Program
 * @typedef {{ programs: Array<SplitMode1Program>, shared: Set<string> }} SplitMode1State
 */

/**
 * 
 * @param {string} input
 */
export async function splitPerProgramWithSingleSharedData(input) {
    const iife = await fs.readFile(input, 'utf-8')
    const { esm, programNodes } = convert(iife)

    if (programNodes.length < 1) {
        throw new Error(`Could not extract a main program from '${input}'`)
    } else if (programNodes.length === 1) {
        console.warn('Did not split the file because it contains only one program.')
        const esm = convertAndRemoveDeadCode(iife)
        let newEsm = `// extracted from ${input}\n` + esm
        await fs.writeFile(input + '.dce.mjs', newEsm, 'utf-8')
    } else {
        await splitWith1stMode({
            outDir: path.dirname(input),
            basename: path.basename(input),
            programNodes,
            esm,
        })
    }
}

/**
 * Splits the `esm` code into one file per Elm program.
 * Each imports that shared code from `${basename}.Shared.mjs` and exports only one Elm program.
 * 
 * The global code that creates side effects is also copied into the shared file.
 * 
 * @param {SplitMode1} param
 * @returns {Promise<string[]>} List of written files
 */
async function splitWith1stMode({ outDir, basename, programNodes, esm }) {
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

    /** @type {(deps: Set<string>) => Array<Chunk>} */
    const getChunks = deps =>
        Array.from(deps, key => {
            const value = map.declarations.get(key)
            if (!value) throw new Error(`Could not find dependency '${key}'`)
            return value
        })

    /** @type {(deps: Set<string>, chunks?: Array<Chunk>) => string } */
    const depsToString = (deps, chunks = []) =>
        getChunks(deps)
            .concat(...chunks)
            // sort deps by occurrence in Elm file
            .sort((a, b) => a.startIndex - b.startIndex)
            // then copy only those chunks into a new file
            .map(chunk => esm.substring(chunk?.startIndex ?? 0, chunk?.endIndex ?? 0))
            .join('\n')
        + '\n'

    // also inserts the unnamed code
    let sharedCode = depsToString(shared, map.unnamed)
    sharedCode += `export { ${Array.from(shared).join(', ')} };\n`

    const sharedLib = 'shared'
    const sharedFilename = `${basename}.${sharedLib}.mjs`
    const dest = path.join(outDir, sharedFilename)
    files.push(writeFile(dest, sharedCode))

    for (const program of programs) {
        console.log('Extracting', program.name)
        let orig = depsToString(program.needs) + exportsToString([program])

        const tree = jsParser.parse(orig)
        const identifiers = tree.rootNode.descendantsOfType('identifier')
            .filter(node => shared.has(node.text))

        let code = `import * as ${sharedLib} from './${sharedFilename}';\n`
        let lastIndex = 0
        for (const identifier of identifiers) {
            code += orig.substring(lastIndex, identifier.startIndex) + sharedLib + '.'
            lastIndex = identifier.startIndex
        }
        code += orig.substring(lastIndex) + '\n'

        const dest = path.join(outDir, `${basename}.${program.name}.mjs`)
        files.push(writeFile(dest, code))
    }
    return Promise.all(files)
}

/**
 * 
 * @param {string} file 
 * @param {string} content 
 * @returns {Promise<string>} file written to
 */
async function writeFile(file, content) {
    await fs.writeFile(file, content, 'utf-8')
    console.log(`Wrote ${file}`)
    return file
}

/**
 * Removes common dependencies from the `programs` and adds them to `shared`.
 * 
 * @param {SplitMode1State} data
 * @returns {undefined}
 */
export function transformStateForSplitMode1({ programs, shared }) {
    // compare all needed dependencies between all programs
    for (let index = 0; index < programs.length; index++) {
        const a = programs[index];
        for (const s of shared.values()) {
            if (a.needs.delete(s)) a.shared.add(s)
        }
        // compare to all other programs
        for (let b of programs.slice(index + 1)) {
            a.needs.forEach(need => {
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

/**
 * 
 * @param {import("fs").PathLike | fs.FileHandle} input
 * @returns 
 */
export async function wipAnalyze(input) {
    const iife = await fs.readFile(input, 'utf-8')
    const esm = convertAndRemoveDeadCode(iife)
    let newEsm = `// extracted from ${input}\n` + esm
    await writeFile(input + '.dce.mjs', newEsm)

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
    return (new TextEncoder().encode(string)).length
}

/**
 * 
 * @param {string} code 
 * @returns {Array<{ name: string, init: SyntaxNode }>}
 */
function parsePlatformExport(code) {
    const tree = jsParser.parse(code)
    const obj = tree.rootNode.child(0)?.child(0)
    if (!obj) throw new Error('Could not find object argument in `_Platform_export` function call')
    // get all pairs of `<FileName>: {'init':$author$project$<FileName>$main(<..>)(<..>)}`
    const programNodes =
        obj.namedChildren
            .filter(node => node.type === 'pair' && node.childCount === 3)
            .map(node => parseProgramPair(node.children[0], node.children[2]))

    return programNodes
}

/**
 * 
 * @param {SyntaxNode} key 
 * @param {SyntaxNode} value 
 * @returns {{ name: string, init: SyntaxNode }}
 */
function parseProgramPair(key, value) {
    const name = getKeyOfObject(key)
    if (name instanceof Error) {
        throw new Error(`Could not parse the program name from '${key.text}'`, { cause: name })
    }

    if (value.type !== 'object'
        || value.childCount !== 3
        || value.children[1].type !== 'pair'
        || value.children[1].childCount !== 3
    ) {
        throw new Error(`Expected an object with only one pair inside, but got '${value.text}'`)
    }
    let pair = value.children[1]
    const init = getKeyOfObject(pair.children[0])
    if (init !== 'init') {
        throw new Error(`Expected an object key named 'init', but got '${init}'`, { cause: init })
    }

    return { name, init: pair.children[2] }
}

/**
 * 
 * @param {SyntaxNode} node an `ObjectNode` with type `object` 
 * @returns {string|Error}
 */
function getKeyOfObject(node) {
    switch (node.type) {
        case 'string':
            if (node.childCount !== 3 && node.children[1].type !== 'string_fragment') {
                return new Error(`Unexpected shape of 'string' node type`)
            }
            return node.children[1].text

        case 'property_identifier':
            return node.text

        default:
            return new Error(`Unknown type of object key: '${node.type}'`)
    }
}
