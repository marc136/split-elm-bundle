import { expect, describe, test } from 'vitest'
import { wipAnalyze } from './split-esm.mjs'

test('compile Static.elm', async () => {
    const result = await wipAnalyze('examples/from-aide/compiled/Static.js')
    expect(result).toMatchInlineSnapshot(`
      {
        "esmByteSize": 29530,
        "esmChars": 29530,
        "iifeByteSize": 92933,
        "iifeChars": 92933,
      }
    `)
})

test('compile BrowserElement.elm', async () => {
    const result = await wipAnalyze('examples/from-aide/compiled/BrowserElement.js')
    expect(result).toMatchInlineSnapshot(`
      {
        "esmByteSize": 71194,
        "esmChars": 71194,
        "iifeByteSize": 113593,
        "iifeChars": 113593,
      }
    `)
})

test('compile BrowserApplication.elm', async () => {
    const result = await wipAnalyze('examples/from-aide/compiled/BrowserApplication.debug.js')
    expect(result).toMatchInlineSnapshot(`
      {
        "esmByteSize": 84582,
        "esmChars": 84582,
        "iifeByteSize": 280011,
        "iifeChars": 279991,
      }
    `)
})

test('compile BrowserSandbox+BrowserElement.elm', async () => {
    const result = await wipAnalyze('examples/from-aide/compiled/BrowserSandbox+BrowserElement.js')
    expect(result).toMatchInlineSnapshot(`
      {
        "esmByteSize": 74134,
        "esmChars": 74134,
        "iifeByteSize": 116487,
        "iifeChars": 116487,
      }
    `)
})
