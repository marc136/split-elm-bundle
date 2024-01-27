import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
const gzip = promisify(zlib.gzip)

/**
 * @typedef {{ raw: number; gzip: number }} Sizes
 * @typedef {{ file: string; size: Sizes }} FileWithSizes
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
 * @returns {Promise<FileWithSizes>}
 */
export async function writeFileAndPrintSizes(file, content) {
    await fs.writeFile(file, content, 'utf-8')
    const size = await stringSizeGzip(content)
    console.log(`Wrote ${path.basename(file)} ${sizesToString(size)}`)
    return { file, size }
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
