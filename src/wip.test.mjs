import fs from 'node:fs/promises'
import { expect, describe, test } from 'vitest'
import assert from 'node:assert';
import { jsParser } from './js-parser.mjs';
import { getDeclarationsAndDependencies, getDependenciesOf } from './dependency-graph.mjs';
import { wipAnalyze } from "./convert-iife.mjs"

test('wip analyze', async () => {
    const map = await wipAnalyze('example/compiled/Static.js')
})
