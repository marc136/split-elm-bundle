import fs from 'node:fs/promises'
import { expect, describe, test } from 'vitest'
import { convert } from './convert-iife.mjs'


describe('Converts Elm IIFE to ESM and extracts programs', async () => {
    const name = 'BrowserSandbox+BrowserElement.optimize'
    const iife = await fs.readFile(`example/compiled/${name}.js`, 'utf-8')
    const { esm, programNodes } = convert(iife)

    test('Should find expected Elm programs', async () => {
        const programIdentifiers = programNodes.map(program =>
            [program.name, program.init.descendantsOfType('identifier').map(n => n.text)]
        )
        expect(programIdentifiers).toMatchSnapshot()
    })

    test('Should generate expected ESM code', () => {
        expect(esm).toMatchFileSnapshot(`../example/compiled/${name}.mjs`)
    })
})
