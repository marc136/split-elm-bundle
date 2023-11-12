import fs from 'node:fs/promises'
import { expect, describe, test } from 'vitest'
import assert from 'node:assert';
import { jsParser } from './js-parser.mjs';
import { getDeclarationsAndDependencies, getDependenciesOf } from './dependency-graph.mjs';

describe('parse short chunks', () => {
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

    test('Variable declaration with nested function call and declaration', () => {
        const chunk = `
var _VirtualDom_init = F4(function(virtualNode, flagDecoder, debugMetadata, args)
{
	// NOTE: this function needs _Platform_export available to work

	/**_UNUSED/
	var node = args['node'];
	//*/
	/**/
	var node = args && args['node'] ? args['node'] : _Debug_crash(0);
	//*/

	node.parentNode.replaceChild(
		_VirtualDom_render(virtualNode, function() {}),
		node
	);

	return {};
});`
        const actual = Array.from(getDeclarationsAndDependencies(chunk))
        expect(actual).toMatchInlineSnapshot(`
          [
            [
              "_VirtualDom_init",
              {
                "endIndex": 384,
                "name": "_VirtualDom_init",
                "needs": [
                  "F4",
                ],
                "startIndex": 1,
              },
            ],
          ]
        `)
    })

    test('Function declaration with a simple call expression', () => {
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

    test('Function declaration for curried `F2`', () => {
        const chunk = `function F2(fun) {
  return F(2, fun, function(a) { return function(b) { return fun(a,b); }; })
}`
        const actual = Array.from(getDeclarationsAndDependencies(chunk))
        expect(actual).toMatchInlineSnapshot(`
          [
            [
              "F2",
              {
                "endIndex": 97,
                "name": "F2",
                "needs": [
                  "F",
                ],
                "startIndex": 0,
              },
            ],
          ]
        `)
    })

    test('Function declaration returning multiple nested functions', () => {
        const chunk = `
function F4(fun) {
  return F(4, fun, function(a) { return function(b) { return function(c) {
    return function(d) { return fun(a, b, c, d); }; }; };
  });
}`
        const actual = Array.from(getDeclarationsAndDependencies(chunk))
        expect(actual).toMatchInlineSnapshot(`
          [
            [
              "F4",
              {
                "endIndex": 160,
                "name": "F4",
                "needs": [
                  "F",
                ],
                "startIndex": 1,
              },
            ],
          ]
        `)
    })
})

/**
 * 
 * @typedef {import('tree-sitter').SyntaxNode} SyntaxNode
 * 
 * @param {SyntaxNode} node 
 * @returns {Array<SyntaxNode>} where every `.type` === 'identifier'
 */
function getAllIdentifiers(node) {
    return node.descendantsOfType('identifier')
}
