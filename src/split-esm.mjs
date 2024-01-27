import fs from 'node:fs/promises';
import path from 'node:path';
import { jsParser } from './js-parser.mjs';
import { getDeclarationsAndDependencies, getDependenciesOf } from './dependency-graph.mjs';
import { convert, writeFile, exportsToString } from './convert-iife.mjs';
import { byteToStr, sizesToString, stringSizeGzip, writeFileAndPrintSizes } from './file-size.mjs';

/**
 * @typedef { import('tree-sitter').SyntaxNode} SyntaxNode
 *
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

    let strings = dependenciesToChunks(deps, map.declarations, map.unnamed)
        .map(chunk => esm.substring(chunk.startIndex, chunk.endIndex))

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
    return fetchChunksForDependencies(deps, declarations)
        .concat(...chunks)
        // sort deps by occurrence in Elm file
        .sort((a, b) => a.startIndex - b.startIndex)
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
        return value
    })
}

/**
 * @param {string} filePath
 */
export async function splitPerProgramWithSingleSharedData(filePath) {
    const iife = await fs.readFile(filePath, 'utf-8')
    console.log(`Working in directory ${path.dirname(filePath)}`)
    const before = await stringSizeGzip(iife)
    console.log(`Read ${path.basename(filePath)} ${sizesToString(before)}`)
    const input = { file: filePath, sizes: before }
    const { esm, programNodes } = convert(iife)

    if (programNodes.length < 1) {
        throw new Error(`Could not extract a main program from '${filePath}'`);
    } else if (programNodes.length === 1) {
        console.warn('Did not split the file because it contains only one program.');
        const esm = convertAndRemoveDeadCode(iife);
        let newEsm = `// extracted from ${filePath}\n` + esm;
        await writeFileAndPrintSizes(filePath + '.dce.mjs', newEsm);
    } else {
        await splitWith1stMode({
            outDir: path.dirname(filePath),
            basename: path.basename(filePath, path.extname(filePath)) + '.split',
            programNodes,
            esm,
        });
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
    const files = [];
    const map = getDeclarationsAndDependencies(esm);

    const programs = programNodes.map(n => ({
        name: n.name,
        init: n.init,
        needs: getDependenciesOf(n.name, map),
        // keeping track of the shared dependencies so I can replace them later
        shared: new Set(),
    }));
    const shared = new Set(map.unnamed.flatMap(({ needs }) => needs));

    transformStateForSplitMode1({ programs, shared });

    /** @type {(deps: Set<string>, chunks?: Array<Chunk>) => string } */
    const depsToString = (deps, chunks = []) => dependenciesToChunks(deps, map.declarations, chunks)
        .map(chunk => esm.substring(chunk?.startIndex ?? 0, chunk?.endIndex ?? 0))
        .join('\n')
        + '\n';

    // also inserts the unnamed code
    let sharedCode = depsToString(shared, map.unnamed);
    sharedCode += `export { ${Array.from(shared).join(', ')} };\n`;

    const sharedLib = 'shared';
    const sharedFilename = `${basename}.${sharedLib}.mjs`;
    const dest = path.join(outDir, sharedFilename);
    files.push(writeFileAndPrintSizes(dest, sharedCode));

    for (const program of programs) {
        console.log('Extracting', program.name);
        let orig = depsToString(program.needs) + exportsToString([program]);

        const tree = jsParser.parse(orig);
        const identifiers = tree.rootNode.descendantsOfType('identifier')
            .filter(node => shared.has(node.text));

        let code = `import * as ${sharedLib} from './${sharedFilename}';\n`;
        let lastIndex = 0;
        for (const identifier of identifiers) {
            code += orig.substring(lastIndex, identifier.startIndex) + sharedLib + '.';
            lastIndex = identifier.startIndex;
        }
        code += orig.substring(lastIndex) + '\n';

        const dest = path.join(outDir, `${basename}.${program.name}.mjs`);
        files.push(writeFileAndPrintSizes(dest, code));
    }
    return Promise.all(files);
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
