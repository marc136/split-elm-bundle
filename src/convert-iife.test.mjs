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

describe.only('parse short chunks', () => {
    test('Empty variable declaration', () => {
        const chunk = 'var _VirtualDom_divertHrefToApp;'
        const actual = Array.from(getDeclarationsAndDependencies(chunk))
        expect(actual).toMatchInlineSnapshot(`
          [
            [
              "_VirtualDom_divertHrefToApp",
              {
                "endIndex": 32,
                "name": "_VirtualDom_divertHrefToApp",
                "needs": [],
                "startIndex": 0,
              },
            ],
          ]
        `)
    })

    test('Variable declaration with ternary expression', () => {
        const chunk = `var _VirtualDom_doc = typeof document !== 'undefined' ? document : {};`
        const actual = Array.from(getDeclarationsAndDependencies(chunk))
        expect(actual).toMatchInlineSnapshot(`
          [
            [
              "_VirtualDom_doc",
              {
                "endIndex": 70,
                "name": "_VirtualDom_doc",
                "needs": [],
                "startIndex": 0,
              },
            ],
          ]
        `)
    })

    test('function declaration without nested scope', () => {
        const chunk = `
function _VirtualDom_appendChild(parent, child)
{
    parent.appendChild(child);
}`
        const actual = Array.from(getDeclarationsAndDependencies(chunk))
        expect(actual).toMatchInlineSnapshot(`
          [
            [
              "_VirtualDom_appendChild",
              {
                "endIndex": 83,
                "name": "_VirtualDom_appendChild",
                "needs": [],
                "startIndex": 1,
              },
            ],
          ]
        `)
    })
