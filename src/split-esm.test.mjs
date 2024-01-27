import { expect, describe, test } from 'vitest'
import { transformStateForSplitMode1 } from './split-esm.mjs'

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
