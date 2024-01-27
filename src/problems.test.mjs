import fs from 'node:fs/promises'
import { expect, describe, test } from 'vitest'
import { getDeclarationsAndDependencies } from './dependency-graph.mjs'

/**
 * This file tests problems with specific Elm kernel code
 */

test('Parse elm-explorations/markdown Kernel code', async () => {
    const kernelCode = 'test/problems/elm-exploration/markdown/src/Elm/Kernel/Markdown.js'
    const chunk = await fs.readFile(kernelCode, 'utf-8')
    const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
    expect(actual).toMatchInlineSnapshot(`
  [
    [
      "_Markdown_toHtml",
      {
        "endIndex": 563,
        "name": "_Markdown_toHtml",
        "needs": [
          "F3",
          "_VirtualDom_custom",
          "_Markdown_render",
          "_Markdown_diff",
        ],
        "startIndex": 351,
      },
    ],
    [
      "_Markdown_render",
      {
        "endIndex": 706,
        "name": "_Markdown_render",
        "needs": [
          "A2",
          "_Markdown_replace",
          "_VirtualDom_doc",
        ],
        "startIndex": 594,
      },
    ],
    [
      "_Markdown_diff",
      {
        "endIndex": 847,
        "name": "_Markdown_diff",
        "needs": [
          "_Markdown_replace",
        ],
        "startIndex": 709,
      },
    ],
    [
      "_Markdown_replace",
      {
        "endIndex": 1011,
        "name": "_Markdown_replace",
        "needs": [
          "F2",
          "_Markdown_marked",
          "_Markdown_formatOptions",
        ],
        "startIndex": 850,
      },
    ],
    [
      "_Markdown_marked",
      {
        "endIndex": 20983,
        "name": "_Markdown_marked",
        "needs": [],
        "startIndex": 1043,
      },
    ],
    [
      "_Markdown_formatOptions",
      {
        "endIndex": 21622,
        "name": "_Markdown_formatOptions",
        "needs": [
          "__Maybe_isJust",
        ],
        "startIndex": 21032,
      },
    ],
  ]
`)
})
