import fs from 'node:fs/promises'
import { expect, describe, test } from 'vitest'
import assert from 'node:assert';
import { jsParser } from './js-parser.mjs';
import { getDeclarationsAndDependencies, getDependenciesOf } from './dependency-graph.mjs';
import { wipAnalyze, transformStateForSplitMode1 } from "./convert-iife.mjs"

test('Simple split of shared deps', () => {
    /** @type import('tree-sitter').SyntaxNode */
    // @ts-expect-error fake value for test
    const init = null
    const data = {
        programs: [
            { name: 'one', needs: new Set(['a', 'b']), shared: new Set(), init },
            { name: 'two', needs: new Set(['c', 'd', 'b']), shared: new Set(), init },
        ],
        shared: new Set(['d']),
    }
    transformStateForSplitMode1(data)
    expect(data).toMatchInlineSnapshot(`
      {
        "programs": [
          {
            "init": null,
            "name": "one",
            "needs": Set {
              "a",
            },
            "shared": Set {
              "b",
            },
          },
          {
            "init": null,
            "name": "two",
            "needs": Set {
              "c",
            },
            "shared": Set {
              "b",
              "d",
            },
          },
        ],
        "shared": Set {
          "d",
          "b",
        },
      }
    `)
})

test.skip('template', () => {
    const chunk = ``
    const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
    expect(actual).toMatchInlineSnapshot()
})
