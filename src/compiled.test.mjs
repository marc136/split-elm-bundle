import { expect, describe, test } from 'vitest'
import { wipAnalyze } from "./convert-iife.mjs"

test('compile Static.elm', async () => {
    const result = await wipAnalyze('example/compiled/Static.js')
    expect(result).toMatchInlineSnapshot(`
      {
        "esmByteSize": 29519,
        "esmChars": 29519,
        "iifeByteSize": 92933,
        "iifeChars": 92933,
      }
    `)
})

test('compile BrowserElement.elm', async () => {
    const result = await wipAnalyze('example/compiled/BrowserElement.js')
    expect(result).toMatchInlineSnapshot(`
      {
        "esmByteSize": 71183,
        "esmChars": 71183,
        "iifeByteSize": 113593,
        "iifeChars": 113593,
      }
    `)
})

test('compile BrowserApplication.elm', async () => {
    const result = await wipAnalyze('example/compiled/BrowserApplication.debug.js')
    expect(result).toMatchInlineSnapshot(`
      {
        "esmByteSize": 84571,
        "esmChars": 84571,
        "iifeByteSize": 280011,
        "iifeChars": 279991,
      }
    `)
})

test('compile BrowserSandbox+BrowserElement.elm', async () => {
    const result = await wipAnalyze('example/compiled/BrowserSandbox+BrowserElement.js')
    expect(result).toMatchInlineSnapshot(`
      {
        "esmByteSize": 74123,
        "esmChars": 74123,
        "iifeByteSize": 116487,
        "iifeChars": 116487,
      }
    `)
})
