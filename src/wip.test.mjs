import fs from 'node:fs/promises'
import { expect, describe, test } from 'vitest'
import assert from 'node:assert';
import { jsParser } from './js-parser.mjs';
import { getDeclarationsAndDependencies, getDependenciesOf } from './dependency-graph.mjs';
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
        "esmByteSize": 67620,
        "esmChars": 67620,
        "iifeByteSize": 113593,
        "iifeChars": 113593,
      }
    `)
})

test('compile BrowserApplication.elm', async () => {
    const result = await wipAnalyze('example/compiled/BrowserApplication.debug.js')
    expect(result).toMatchInlineSnapshot(`
      {
        "esmByteSize": 81368,
        "esmChars": 81368,
        "iifeByteSize": 280011,
        "iifeChars": 279991,
      }
    `)
})

test.skip('template', () => {
    const chunk = ``
    const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
    expect(actual).toMatchInlineSnapshot()
})
