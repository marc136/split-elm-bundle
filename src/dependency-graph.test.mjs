import fs from 'node:fs/promises'
import { expect, describe, test } from 'vitest'
import assert from 'node:assert'
import { jsParser } from './js-parser.mjs'
import { getDeclarationsAndDependencies, getDependenciesOf } from './dependency-graph.mjs'

describe('parse short chunks', () => {
    test('Empty variable declaration', () => {
        const chunk = 'var _VirtualDom_divertHrefToApp;'
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
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
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
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
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "_VirtualDom_init",
          {
            "endIndex": 384,
            "name": "_VirtualDom_init",
            "needs": [
              "F4",
              "_Debug_crash",
              "_VirtualDom_render",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('Variable declarations are scoped to function scope', () => {
        const chunk = `
function _VirtualDom_diffKeyedKids(xParent, yParent, patches, rootIndex)
{
    var index = rootIndex;
    var yNext = 1;
    if (yNext)
    {
        var yNextNode = yNext.b;
    }

    // swap x and y
    if (true)
    {
        _VirtualDom_diffHelp(yNextNode, index);
    }
}`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "_VirtualDom_diffKeyedKids",
          {
            "endIndex": 278,
            "name": "_VirtualDom_diffKeyedKids",
            "needs": [
              "_VirtualDom_diffHelp",
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
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
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
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
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
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
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

    test('Nested function declaration which calls itself', () => {
        const chunk = `
function _VirtualDom_makeCallback(eventNode, initialHandler)
{
  console.log(callback)
  function callback(event)
  {
      var handler = callback.q;
      // ...
  }

  callback.q = initialHandler;

  return callback;
}`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
[
  [
    "_VirtualDom_makeCallback",
    {
      "endIndex": 221,
      "name": "_VirtualDom_makeCallback",
      "needs": [],
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
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
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

    test('Understands `update_expression` in for loop', () => {
        const chunk = `
var _JsArray_foldr = F3(function(func, acc, array)
{
    for (var i = array.length - 1; i >= 0; i--)
    {
        acc = A2(func, array[i], acc);
    }

    return acc;
});
`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "_JsArray_foldr",
          {
            "endIndex": 173,
            "name": "_JsArray_foldr",
            "needs": [
              "F3",
              "A2",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('throw an Error', () => {
        const chunk = `
    function _Debug_crash_UNUSED(identifier)
    {
            throw new Error(baseUrl + '/elm/core/blob/1.0.0/hints/' + identifier + '.md');
    }
    `
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
          [
            [
              "_Debug_crash_UNUSED",
              {
                "endIndex": 148,
                "name": "_Debug_crash_UNUSED",
                "needs": [
                  "baseUrl",
                ],
                "startIndex": 5,
              },
            ],
          ]
        `)
    })

    test('`switch_statement` and variables it introduces in the scope', () => {
        const chunk = `
function _Debug_crash(identifier, fact1, fact2, fact3, fact4)
{
    switch(identifier)
    {
            case 0:
                    throw new Error('What node should I take over? In JavaScript I need something like:\n\n    Elm.Main.init({\n        node: document.getElementById("elm-node")\n    })\n\nYou need to do this with any Browser.sandbox or Browser.element program.');

            case 4:
                    var portName = fact1;
                    var problem = fact2;
                    throw new Error('Trying to send an unexpected type of value through port \`' + portName + '\`:\n' + problem);

            case 9:
                    var moduleName = fact1;
                    var region = fact2;
                    var value = fact3;
                    var message = fact4;
                    throw new Error(
                            'TODO in module \`' + moduleName + '\` from the \`case\` expression '
                            + _Debug_regionToString(region) + '\n\nIt received the following value:\n\n    '
                            + _Debug_toString(value).replace('\n', '\n    ')
                            + '\n\nBut the branch that handles it says:\n\n    ' + message.replace('\n', '\n    ')
                    );

            default:
                    throw new Error('What went wrong?')
    }
}
`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "_Debug_crash",
          {
            "endIndex": 1317,
            "name": "_Debug_crash",
            "needs": [
              "_Debug_regionToString",
              "_Debug_toString",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('Many `variable_delarator`s in one `variable_declaration`', () => {
        const chunk = `var a=1, b= c, d = a + "(d)", e =globalVariable`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
          [
            [
              "a",
              {
                "endIndex": 47,
                "name": "a",
                "needs": [
                  "c",
                  "globalVariable",
                ],
                "startIndex": 0,
              },
            ],
            [
              "b",
              {
                "endIndex": 47,
                "name": "b",
                "needs": [
                  "c",
                  "globalVariable",
                ],
                "startIndex": 0,
              },
            ],
            [
              "d",
              {
                "endIndex": 47,
                "name": "d",
                "needs": [
                  "c",
                  "globalVariable",
                ],
                "startIndex": 0,
              },
            ],
            [
              "e",
              {
                "endIndex": 47,
                "name": "e",
                "needs": [
                  "c",
                  "globalVariable",
                ],
                "startIndex": 0,
              },
            ],
          ]
        `)
    })

    test('`assignment_expression` inside `for_statement`', () => {
        const chunk = `
function _Utils_eq(x, y)
{
        for (
                var pair, stack = [], isEqual = _Utils_eqHelp(x, y, 0, stack);
                isEqual && (pair = stack.pop());
                isEqual = _Utils_eqHelp(pair.a, pair.b, 0, stack)
                )
        {}

        return isEqual;
}
`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "_Utils_eq",
          {
            "endIndex": 291,
            "name": "_Utils_eq",
            "needs": [
              "_Utils_eqHelp",
              "_Utils_eqHelp",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('`for_in_statement`', () => {
        const chunk = `
function abc() {
    for (var one in x) {
        console.log(one)
    }

    try {
        for (var two in one) {
            console.log(two)
        }
    }
}

`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "abc",
          {
            "endIndex": 162,
            "name": "abc",
            "needs": [
              "x",
              "one",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('`sequence_expression` inside `for_statement`', () => {
        const chunk = `
function _Utils_cmp(x,y,ord) 
{
    for (; x.b && y.b && !(ord = _Utils_cmp(x.a, y.a)); fake = global1, x = x.b, y = global2) {} // WHILE_CONSES
}
`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "_Utils_cmp",
          {
            "endIndex": 147,
            "name": "_Utils_cmp",
            "needs": [
              "fake",
              "global1",
              "global2",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('`while` and `do...while` loops', () => {
        const chunk = `
function _String_reverse(str)
{
        var len = str.length;
        var arr = new Array(len);
        var i = 0;
        while (i < len && global1)
        {
                var word = str.charCodeAt(i);
                if (0xD800 <= word && word <= 0xDBFF)
                {
                        arr[len - i] = str[i + 1];
                        i++;
                        arr[len - i] = str[i - 1];
                        i++;
                }
                else
                {
                        arr[len - i] = str[i];
                        i++;
                }
        }

        do {
            global2()
        } while (global3)
        return arr.join('');
}`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "_String_reverse",
          {
            "endIndex": 692,
            "name": "_String_reverse",
            "needs": [
              "global1",
              "global2",
              "global3",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('`augmented_assignment_expression`', () => {
        const chunk = `
function _Char_fromCode(code)
{
        return _Utils_chr(
                (code < 0 || 0x10FFFF < code)
                        ? '\uFFFD'
                        :
                (code <= 0xFFFF)
                        ? String.fromCharCode(code)
                        :
                (code -= 0x10000,
                        String.fromCharCode(Math.floor(code / 0x400) + 0xD800, code % 0x400 + 0xDC00)
                )
        );
}
`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "_Char_fromCode",
          {
            "endIndex": 439,
            "name": "_Char_fromCode",
            "needs": [
              "_Utils_chr",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('`assignment_expression` inside function `arguments`', () => {
        const chunk = `
function sendToApp(msg, viewMetadata)
{
        var pair = A2(update, msg, model);
        stepper(model = pair.a, viewMetadata);
        _Platform_enqueueEffects(managers, pair.b, subscriptions(model));
}
`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "sendToApp",
          {
            "endIndex": 206,
            "name": "sendToApp",
            "needs": [
              "A2",
              "update",
              "model",
              "stepper",
              "model",
              "_Platform_enqueueEffects",
              "managers",
              "subscriptions",
              "model",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('Simplified _Platform_effectManager declaration', () => {
        const chunk = `
function _Platform_setupOutgoingPort(name, sendToApp)
{
    _Platform_effectManagers[name].c = F3(function(router, cmdList, state)
    {
        return init;
    });
}
`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "_Platform_setupOutgoingPort",
          {
            "endIndex": 168,
            "name": "_Platform_setupOutgoingPort",
            "needs": [
              "_Platform_effectManagers",
              "F3",
              "init",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('`assignment_expression` inside function `arguments`', () => {
        const chunk = `
function _Platform_setupOutgoingPort(name)
{
    _Platform_effectManagers[name].c = F3(function(router, cmdList, state)
    {
            for ( ; cmdList.b; cmdList = cmdList.b) // WHILE_CONS
            {
                    // grab a separate reference to subs in case unsubscribe is called
                    var currentSubs = subs;
                    var value = _Json_unwrap(converter(cmdList.a));
                    for (var i = 0; i < currentSubs.length; i++)
                    {
                            currentSubs[i](value);
                    }
            }
            return init;
    });
}`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "_Platform_setupOutgoingPort",
          {
            "endIndex": 614,
            "name": "_Platform_setupOutgoingPort",
            "needs": [
              "_Platform_effectManagers",
              "F3",
              "subs",
              "_Json_unwrap",
              "converter",
              "init",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('labeled statements', () => {
        const chunk = `
var $elm$core$Dict$foldr = F3(
	function (func, acc, t) {
		foldr:
		while (true) {
			if (t.$ === 'RBEmpty_elm_builtin') {
				return acc;
			} else {
				var key = t.b;
				var value = t.c;
				var left = t.d;
				var right = t.e;
				var $temp$func = func,
					$temp$acc = A3(
					func,
					key,
					value,
					A3($elm$core$Dict$foldr, func, acc, right)),
					$temp$t = left;
				func = $temp$func;
				acc = $temp$acc;
				t = $temp$t;
				continue foldr;
			}
		}
	});`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "$elm$core$Dict$foldr",
          {
            "endIndex": 480,
            "name": "$elm$core$Dict$foldr",
            "needs": [
              "F3",
              "A3",
              "A3",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('`_VirtualDom_init`', () => {
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
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
[
  [
    "_VirtualDom_init",
    {
      "endIndex": 374,
      "name": "_VirtualDom_init",
      "needs": [
        "F4",
        "_Debug_crash",
        "_VirtualDom_render",
      ],
      "startIndex": 1,
    },
  ],
]
`)
    })

    test('`_VirtualDom_nodeNS`', () => {
        const chunk = `
var _VirtualDom_nodeNS = F2(function(namespace, tag)
{
  return F2(function(factList, kidList)
  {
    for (var kids = [], descendantsCount = 0; kidList.b; kidList = kidList.b) // WHILE_CONS
    {
      var kid = kidList.a;
      descendantsCount += (kid.b || 0);
      kids.push(kid);
    }
    descendantsCount += kids.length;

    return {
      $: 1,
      c: tag,
      d: _VirtualDom_organizeFacts(factList),
      e: kids,
      f: namespace,
      b: descendantsCount
    };
  });
});`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "_VirtualDom_nodeNS",
          {
            "endIndex": 493,
            "name": "_VirtualDom_nodeNS",
            "needs": [
              "F2",
              "F2",
              "_VirtualDom_organizeFacts",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('Find `_VirtualDom_doc` inside return statement', () => {
        const chunk = `
function _VirtualDom_render(vNode, eventNode)
{
var tag = vNode.$;

if (tag === 5)
{
  return _VirtualDom_render(vNode.k || (vNode.k = vNode.m()), eventNode);
}

if (tag === 0)
{
  return _VirtualDom_doc.createTextNode(vNode.a);
}
}`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
    [
      [
        "_VirtualDom_render",
        {
          "endIndex": 233,
          "name": "_VirtualDom_render",
          "needs": [
            "_VirtualDom_doc",
          ],
          "startIndex": 1,
        },
      ],
    ]
  `)
    })
})

describe('Get dependencies of simplified static (Html) main program', () => {
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
    const result = getDeclarationsAndDependencies(chunk)

    test('For `_List_fromArray`', () => {
        const actual = getDependenciesOf('_List_fromArray', result)
        expect(actual).toMatchObject(new Set(['_List_Nil', '_List_Cons']))
    })

    test('For $author$project$Static$main', () => {
        const actual = getDependenciesOf('$author$project$Static$main', result)
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

describe('Side effects', () => {
    test("needs to pick up `_Platform_effectManagers['Task']`", () => {
        const chunk = `
_Platform_effectManagers['Task'] = _Platform_createManager($elm$core$Task$init, $elm$core$Task$onEffects, $elm$core$Task$onSelfMsg, $elm$core$Task$cmdMap);
var $elm$core$Task$command = _Platform_leaf('Task');
`
        const actual = getDeclarationsAndDependencies(chunk)
        expect(actual).toMatchInlineSnapshot(`
    {
      "declarations": Map {
        "$elm$core$Task$command" => {
          "endIndex": 209,
          "name": "$elm$core$Task$command",
          "needs": [
            "_Platform_leaf",
          ],
          "startIndex": 157,
        },
      },
      "unnamed": [
        {
          "endIndex": 156,
          "names": [],
          "needs": [
            "_Platform_effectManagers",
            "_Platform_createManager",
            "$elm$core$Task$init",
            "$elm$core$Task$onEffects",
            "$elm$core$Task$onSelfMsg",
            "$elm$core$Task$cmdMap",
          ],
          "startIndex": 1,
        },
      ],
    }
  `)
    })
})

describe('ESM exports added by the convert script', () => {
    test('Parse `export const BrowserElement = { init: ... };`', () => {
        const chunk = `export const BrowserElement = { init: $author$project$BrowserElement$main($elm$json$Json$Decode$int)(0) };`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
        [
          [
            "BrowserElement",
            {
              "endIndex": 106,
              "name": "BrowserElement",
              "needs": [
                "$author$project$BrowserElement$main",
                "$elm$json$Json$Decode$int",
              ],
              "startIndex": 0,
            },
          ],
        ]
      `)
    })

    test('Parse `export const BrowserSandbox = { init: ... };`', () => {
        const chunk = `
export const BrowserSandbox = { init: $author$project$BrowserSandbox$main(
$elm$json$Json$Decode$succeed(0))(0) };`
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "BrowserSandbox",
          {
            "endIndex": 115,
            "name": "BrowserSandbox",
            "needs": [
              "$author$project$BrowserSandbox$main",
              "$elm$json$Json$Decode$succeed",
            ],
            "startIndex": 1,
          },
        ],
      ]
    `)
    })

    test('Parse `export const Elm = { BrowserElement, BrowserSandbox };`', () => {
        const chunk = 'export const Elm = { BrowserElement, BrowserSandbox };'
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "Elm",
          {
            "endIndex": 54,
            "name": "Elm",
            "needs": [
              "BrowserElement",
              "BrowserSandbox",
            ],
            "startIndex": 0,
          },
        ],
      ]
    `)
    })

    test('Parse `export default Elm;`', () => {
        const chunk = 'export default Elm;'
        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "defaultExport",
          {
            "endIndex": 19,
            "name": "defaultExport",
            "needs": [
              "Elm",
            ],
            "startIndex": 0,
          },
        ],
      ]
    `)
    })

    test('Named export, default export and `BrowserElement.main`', () => {
        const chunk = `
var $author$project$BrowserElement$main = $elm$browser$Browser$element(
{at: $author$project$BrowserElement$init, az: $author$project$BrowserElement$subscriptions, aB: $author$project$BrowserElement$update, aC: $author$project$BrowserElement$view});

export const BrowserElement = { init: $author$project$BrowserElement$main($elm$json$Json$Decode$int)(0) };
export const BrowserSandbox = { init: $author$project$BrowserSandbox$main(
$elm$json$Json$Decode$succeed(0))(0) };
export const Elm = { BrowserElement, BrowserSandbox };
export default Elm;
`

        const actual = Array.from(getDeclarationsAndDependencies(chunk).declarations)
        expect(actual).toMatchInlineSnapshot(`
      [
        [
          "$author$project$BrowserElement$main",
          {
            "endIndex": 250,
            "name": "$author$project$BrowserElement$main",
            "needs": [
              "$elm$browser$Browser$element",
              "$author$project$BrowserElement$init",
              "$author$project$BrowserElement$subscriptions",
              "$author$project$BrowserElement$update",
              "$author$project$BrowserElement$view",
            ],
            "startIndex": 1,
          },
        ],
        [
          "BrowserElement",
          {
            "endIndex": 358,
            "name": "BrowserElement",
            "needs": [
              "$author$project$BrowserElement$main",
              "$elm$json$Json$Decode$int",
            ],
            "startIndex": 252,
          },
        ],
        [
          "BrowserSandbox",
          {
            "endIndex": 473,
            "name": "BrowserSandbox",
            "needs": [
              "$author$project$BrowserSandbox$main",
              "$elm$json$Json$Decode$succeed",
            ],
            "startIndex": 359,
          },
        ],
        [
          "Elm",
          {
            "endIndex": 528,
            "name": "Elm",
            "needs": [
              "BrowserElement",
              "BrowserSandbox",
            ],
            "startIndex": 474,
          },
        ],
        [
          "defaultExport",
          {
            "endIndex": 548,
            "name": "defaultExport",
            "needs": [
              "Elm",
            ],
            "startIndex": 529,
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
