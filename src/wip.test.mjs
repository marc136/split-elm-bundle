import fs from 'node:fs/promises'
import { expect, describe, test } from 'vitest'
import assert from 'node:assert';
import { jsParser } from './js-parser.mjs';
import { getDeclarationsAndDependencies, getDependenciesOf } from './dependency-graph.mjs';
import { wipAnalyze, transformStateForSplitMode1 } from "./split-esm.mjs"

test.skip('template', () => {
    const chunk = ``
    const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
    expect(actual).toMatchInlineSnapshot()
})
