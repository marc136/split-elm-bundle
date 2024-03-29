import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
const gzip = promisify(zlib.gzip)

/**
 * @typedef {{ raw: number; gzip: number }} Sizes
 * @typedef {{ file: string; sizes: Sizes }} FileWithSizes
 */

/**
 * @param {import('node:fs').PathLike} file
 * @returns {Promise<Sizes>} raw and gzipped sizes in byte
 */
export async function fileSizeGzip(file) {
    return fs.readFile(file).then(bufferSizeGzip)
}

/**
 * @param {string} string
 * @returns {Promise<Sizes>} raw and gzipped sizes in byte
 */
export async function stringSizeGzip(string) {
    const raw = Buffer.from(string, 'utf-8')
    return bufferSizeGzip(raw)
}

/**
 * @param {Buffer} raw
 * @returns {Promise<Sizes>} raw and gzipped sizes in byte
 */
async function bufferSizeGzip(raw) {
    const zipped = await gzip(raw)
    return { raw: raw.byteLength, gzip: zipped.byteLength }
}

/**
 * @param {string} file
 * @param {string} content
 * @param {import('./types/public.js').SideEffects} allowed
 * @returns {Promise<FileWithSizes>}
 */
export async function writeFileAndPrintSizes(file, content, allowed) {
    if (allowed.writeFiles) {
        await fs.writeFile(file, content, 'utf-8')
    }
    const sizes = await stringSizeGzip(content)
    if (allowed.printLogs) {
        const prefix = allowed.writeFiles ? 'Wrote' : 'Would write'
        console.log(prefix, path.basename(file), sizesToString(sizes))
    }
    return { file, sizes }
}

/**
 * @param {Sizes} byte sizes
 * @returns string
 */
export function sizesToString({ raw, gzip }) {
    return `${byteToStr(raw)} (${byteToStr(gzip)} gzip)`
}

/**
 *
 * @param {number} number
 * @returns {string}
 */
export function byteToStr(number) {
    if (isNaN(number) || number < 0) {
        throw new Error('Expected a natural number >= 0')
    }
    if (number < 5_000) {
        return number + 'B'
    } else {
        return (number / 1000).toFixed(1) + 'KiB'
    }
}
