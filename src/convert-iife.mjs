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
 * 
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

    const esm = iife.substring(start, platformExportIndex) + '\n' + programNodesToJs(programNodes)

    return { esm, programNodes }
}


/**
 * 
 * @param {Array<{ name: string, init: SyntaxNode }>} programNodes
 * @returns {string}
 */
function programNodesToJs(programNodes) {
    return [
        programNodes.map(program => `export const ${program.name} = { init: ${program.init.text} };`).join('\n'),
        `export const Elm = { ${programNodes.map(program => program.name).join(', ')} };`,
        'export default Elm;'].join('\n')
}

export async function wipAnalyze(input) {
    const iife = await fs.readFile(input, 'utf-8')

    const { esm, programNodes } = convert(iife)

    const map = getDeclarationsAndDependencies(esm)



    const deps = getDependenciesOf('Static', map)

    let chunks = Array.from(deps, key => map.declarations.get(key))
        .filter(val => !!val)
        .concat(...map.unnamed)

    // sort deps by occurrence in Elm file
    chunks = chunks.sort((a, b) => a?.startIndex - b?.startIndex)

    // then copy only those chunks into a new file
    let newEsm = `// extracted from ${input}\n`
    for (const chunk of chunks) {
        if (!chunk || chunk.endIndex <= chunk.startIndex) {
            const msg = 'Expected chunk with a startIndex and endIndex'
            console.error(msg, chunk)
            throw new Error(msg)
        }
        newEsm += esm.substring(chunk.startIndex, chunk.endIndex) + '\n'
    }

    newEsm += '\n' + programNodesToJs(programNodes) + '\n'

    // then I can diff the output
    // and check if the new file still works

    await fs.writeFile(input + '.marc.mjs', newEsm, 'utf-8')

    return { map, extracted: newEsm }
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
