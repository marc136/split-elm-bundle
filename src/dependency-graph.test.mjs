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
    test('static html rendering', () => {
        const chunk = `
var $author$project$Static$main = A2(
    $elm$html$Html$div,
    _List_fromArray(
        [
            $elm$html$Html$Attributes$id('Static')
        ]),
    _List_fromArray(
        [
            $elm$html$Html$text('Static')
        ]));`
        const actual = Array.from(getDeclarationsAndDependencies(chunk))
        expect(actual).toMatchInlineSnapshot(`
          [
            [
              "$author$project$Static$main",
              {
                "endIndex": 242,
                "name": "$author$project$Static$main",
                "needs": [
                  "A2",
                  "$elm$html$Html$div",
                  "_List_fromArray",
                  "$elm$html$Html$Attributes$id",
                  "_List_fromArray",
                  "$elm$html$Html$text",
                ],
                "startIndex": 1,
              },
            ],
          ]
        `)
    })
})

describe('Get dependencies of browser sandbox main', () => {
    const chunk = `
var $elm$html$Html$div;
var $elm$html$Html$Attributes$id;
var $elm$html$Html$text;

var _List_Nil = { $: 0 };

function _List_Cons(hd, tl) { return { $: 1, a: hd, b: tl }; }

var _List_cons = F2(_List_Cons);

function _List_fromArray(arr)
{
	var out = _List_Nil;
	for (var i = arr.length; i--; )
	{
		out = _List_Cons(arr[i], out);
	}
	return out;
}

function A2(fun, a, b) {
  return fun.a === 2 ? fun.f(a, b) : fun(a)(b);
}
var $author$project$Static$main = A2(
    $elm$html$Html$div,
    _List_fromArray(
        [
            $elm$html$Html$Attributes$id('Static')
        ]),
    _List_fromArray(
        [
            $elm$html$Html$text('Static')
        ]));
    `
    const map = getDeclarationsAndDependencies(chunk)

    test('For `_List_fromArray`', () => {
        const actual = getDependenciesOf('_List_fromArray', map)
        expect(actual).toMatchObject(new Set(['_List_Nil', '_List_Cons']))
    })

    test('For $author$project$Static$main', () => {
        const actual = getDependenciesOf('$author$project$Static$main', map)
        expect(actual).toMatchInlineSnapshot(`
          Set {
            "A2",
            "$elm$html$Html$div",
            "_List_fromArray",
            "$elm$html$Html$Attributes$id",
            "$elm$html$Html$text",
            "_List_Nil",
            "_List_Cons",
          }
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
