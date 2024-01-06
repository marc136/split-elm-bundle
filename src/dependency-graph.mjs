import assert from 'node:assert';
import { jsParser } from './js-parser.mjs';

/**
 * @typedef CodeWithDeps
 * @prop {number} startIndex
 * @prop {number} endIndex
 * @prop {Array<string>} needs
 * 
 * @typedef {{ name: string } & CodeWithDeps} SingleDeclaration 
 * @typedef {{ names: string[] } & CodeWithDeps} MultipleDeclarations
 * 
 * @typedef {import('tree-sitter').SyntaxNode} SyntaxNode
 * @typedef {import('tree-sitter').TreeCursor} TreeCursor
 * 
 * @typedef Dependencies
 * @prop {DependencyMap} declarations
 * @prop {Array<CodeWithDeps>} unnamed 
 * 
 * @typedef {Map<string, SingleDeclaration>} DependencyMap
 * 
 * @typedef DeclarationsInScope
 * @prop {DeclarationsInScope|undefined} parentScope
 * @prop {Array<string>} declarations
 * @prop {boolean} isFunctionScope
 */


/**
 * Gathers all direct and indirect needs of an identifier in one Set.
 * 
 * @param {string} identifier
 * @param { Dependencies } deps
 * @returns {Set<string>}
 */
export function getDependenciesOf(identifier, deps) {
    const result = new Set()
    let queue = [identifier]
    queue.push(...deps.unnamed.flatMap(dep => dep.needs))
    do {
        const id = queue.shift()
        if (!id) break
        if (!result.has(id)) {
            const direct = deps.declarations.get(id)
            if (direct) {
                result.add(direct.name)
                queue.push(...direct.needs)
            } else if (!existsInGlobalScope(id)) {
                throw new Error(`Unknown identifier '${id}'`)
            }
        }
    } while (queue.length > 0)
    result.delete(identifier)
    return result
}

/**
 * This parses the global scope of the Elm compiler's IIFE output.
 * It only needs a reduced amount of possible declarations compared to the more
 * general and complicated findNeedsInStatementBlock.
 * @param {string} code 
 * @returns {Dependencies}
 */
export function getDeclarationsAndDependencies(code) {
    /** @type {DependencyMap} */
    const declarations = new Map()
    /** @type {Array<MultipleDeclarations>} */
    const unnamed = []

    const tree = jsParser.parse(code)
    let cursor = tree.walk()
    cursor.gotoFirstChild()
    try {
        /** @type {SingleDeclaration|MultipleDeclarations|Error|null} */
        let parsed = null
        do {
            switch (cursor.nodeType) {
                case 'var':
                    const result = parseBrokenVariableDeclaration(cursor, code)
                    if (result instanceof Error) {
                        parsed = result
                    } else {
                        parsed = result.declaration
                        cursor = result.cursor
                    }
                    break
                case 'variable_declaration':
                    parsed = parseVariableDeclarations(cursor.currentNode, newScope())
                    break
                case 'function_declaration':
                    parsed = parseFunctionDeclaration(cursor.currentNode, newScope())
                    break
                case 'try_statement':
                case 'expression_statement': {
                    const needs = findNeeds(cursor.currentNode, newScope())
                    if (Array.isArray(needs) && needs.length > 0) {
                        /** @type MultipleDeclarations */
                        const parsed = { names: [], needs, startIndex: cursor.startIndex, endIndex: cursor.endIndex }
                        unnamed.push(parsed)
                    }
                    break
                }
                case 'empty_statement':
                case 'comment':
                    //ignore
                    parsed = null
                    break
                case 'export_statement': {
                    parsed = parseExport(cursor.currentNode, newScope())
                    break
                }
                default:
                    logNode(cursor.currentNode)
                    parsed = new Error(`unknown node type '${cursor.nodeType}'`)
            }

            if (parsed instanceof Error) {
                throw parsed
            }
            if (parsed) {
                if ("names" in parsed) {
                    for (const name of parsed.names) {
                        declarations.set(name, {
                            name, needs: parsed.needs,
                            startIndex: parsed.startIndex, endIndex: parsed.endIndex,
                        })
                    }
                }
                if ("name" in parsed) {
                    declarations.set(parsed.name, parsed)
                }
            }
        } while (cursor.gotoNextSibling())

    } catch (ex) {
        console.warn('Failed at position:', { start: cursor.startPosition, end: cursor.endPosition })
        console.warn(cursor.currentNode.text)
        throw ex
    }
    return { declarations, unnamed }
}

/**
 * Parses a broken variable declaration and returns a new cursor that can parse the rest of the file
 * @param {TreeCursor} cursor 
 * @param {string} code
 * @returns {Error|{declaration:SingleDeclaration,cursor:TreeCursor}}
 */
function parseBrokenVariableDeclaration(cursor, code) {
    const startIndex = cursor.currentNode.startIndex
    cursor.gotoNextSibling()
    if (cursor.nodeType === 'identifier') {
        // tree-sitter cannot parse the code block `var _Markdown_marked = function () {...}();` from
        // https://github.com/elm-explorations/markdown/blob/1.0.0/src/Elm/Kernel/Markdown.js
        if (cursor.nodeText === '_Markdown_marked') {
            const name = cursor.nodeText
            // skip until `return module.exports;\n}();`
            const needle = 'return module.exports;'
            const temp = code.indexOf(needle, startIndex) + needle.length + 1
            const endIndex = code.indexOf(';', temp)
            const declaration = {
                name,
                startIndex,
                endIndex,
                needs: []
            }

            // and then parse a new tree from that position
            const tree = jsParser.parse(code, undefined, {
                includedRanges: [
                    {
                        startIndex: endIndex + 1,
                        endIndex: code.length,
                        // start and end position are not needed
                        startPosition: { row: 1, column: 1 },
                        endPosition: { row: 1, column: 1 },
                    }
                ]
            })

            const newCursor = tree.walk()
            // Note: The first child is a comment node in this case, 
            // so we don't care that we will immediately move to the next sibling.
            // If we need more changes, we might need to introduce a way to skip
            // `cursor.gotoNextSibling` inside `getDeclarationsAndDependencies`
            newCursor.gotoFirstChild()
            return { declaration, cursor: newCursor }
        } else {
            throw new Error(`More code that tree-sitter cannot parse with identifier '${cursor.nodeText}'`)
        }
    }

    throw new Error(`More code that tree-sitter cannot parse of type '${cursor.nodeType}'`)
}

/**
 * @param {SyntaxNode} node a `VariableDeclarationNode` with type `variable_declaration` 
 * @param {DeclarationsInScope} scope is mutated
 * @returns {MultipleDeclarations|Error}
 */
function parseVariableDeclarations(node, scope) {
    const cursor = node.walk()
    cursor.gotoFirstChild()

    /** @type MultipleDeclarations */
    const result = {
        names: [],
        needs: [],
        startIndex: node.startIndex,
        endIndex: node.endIndex,
    }

    do {
        switch (cursor.nodeType) {
            case 'var':
                break
            case 'variable_declarator': {
                const [identifier, _equals, expression] = cursor.currentNode.children
                assert(identifier.type === 'identifier')
                result.names.push(identifier.text)
                insertVariableDeclarationIntoScope(identifier.text, scope)
                if (expression) {
                    result.needs = result.needs.concat(findNeeds(expression, scope))
                }
                break
            }
            case ',':
            case ';':
                break
            default:
                logNode(cursor.currentNode)
                return new Error(`TODO parseVariableDeclaration('${cursor.nodeType}')`)
        }
    } while (cursor.gotoNextSibling())
    return result
}

/**
 * @param {SyntaxNode} node with type `function_declaration`
 * @param {DeclarationsInScope} parentScope
 * @returns {SingleDeclaration|Error}
 */
function parseFunctionDeclaration(node, parentScope) {
    if (node.childCount !== 4
        || node.children[0].type !== 'function'
        || node.children[1].type !== 'identifier'
        || node.children[2].type !== 'formal_parameters'
        || node.children[3].type !== 'statement_block') {
        return new Error('Invalid shape for a `function_declaration`')
    }
    const name = node.children[1].text
    // Add the function declaration to the current scope
    // Note: This is not hoisting the declaration as in JS, if it was used before 
    // it will show up in the list of needed identifiers.
    parentScope.declarations.push(name)

    const formalParameters = node.children[2].namedChildren
        .filter(n => n.type === 'identifier')
        .map(n => n.text)
    const scope = newScope(parentScope, formalParameters)
    scope.isFunctionScope = true
    const needs = findNeeds(node.children[3], scope)
    return { name, needs, startIndex: node.startIndex, endIndex: node.endIndex }
}

/**
 * @param {SyntaxNode} node with type `function_declaration`
 * @param {DeclarationsInScope} scope
 * @returns {SingleDeclaration|Error}
 */
function parseExport(node, scope) {
    if (node.children[0].type === 'export' && node.children[1].type === 'default') {
        return {
            name: 'defaultExport',
            needs: findNeeds(node.children[2], scope),
            startIndex: node.startIndex,
            endIndex: node.endIndex,
        }
    } else {
        return parseNamedExport(node, scope)
    }
}

/**
 * @param {SyntaxNode} node with type `function_declaration`
 * @param {DeclarationsInScope} scope
 * @returns {SingleDeclaration|Error}
 */
function parseNamedExport(node, scope) {
    if (node.childCount !== 2
        || node.children[0].type !== 'export'
        || node.children[1].type !== 'lexical_declaration'
    ) {
        console.error(node.toString())
        console.error(node.children)
        throw new Error('Unexpected `parseNamedExport` shape')
    }
    const [_export, lexicalDeclaration] = node.children

    assert(lexicalDeclaration.children[0].type === 'const')
    assert(lexicalDeclaration.children[1].type === 'variable_declarator')

    const [identifier, _equals, expression] = lexicalDeclaration.children[1].children
    assert(identifier.type === 'identifier')
    const name = identifier.text

    const needs = findNeeds(expression, scope)
    return { name, needs, startIndex: node.startIndex, endIndex: node.endIndex }
}

/**
 * @param {SyntaxNode} node
 * @param {DeclarationsInScope} scope current and parent declarations
 * @returns {Array<string>} 
 */
function findNeeds(node, scope) {
    switch (node.type) {
        case 'function_declaration': {
            const parsed = parseFunctionDeclaration(node, scope)
            if (parsed instanceof Error) throw parsed
            return parsed.needs
        }
        case 'function': {
            return findNeedsInFunction(node, scope)
        }
        case 'parenthesized_expression': {
            return findNeeds(node.children[1], scope)
        }
        case 'arguments':
        case 'if_statement': {
            return node.namedChildren.flatMap(n => findNeeds(n, scope))
        }
        case 'else_clause': {
            return findNeeds(node.children[1], scope)
        }
        case 'for_statement': {
            return findNeedsInForStatement(node, scope)
        }
        case 'for_in_statement': {
            return findNeedsInForInStatement(node, scope)
        }
        case 'variable_declaration': {
            const result = parseVariableDeclarations(node, scope)
            if (result instanceof Error) {
                throw result
            } else {
                return result.needs
            }
        }
        case 'variable_declarator': {
            if (node.childCount !== 3 || node.children[0].type !== 'identifier') {
                throw new Error('Unexpected shape of `variable_declarator` node')
            }
            return findNeeds(node.children[2], newScope(scope, [node.children[0].text]))
        }
        case 'identifier':
            return wrapIdentifier(node.text, scope)
        case 'labeled_statement': {
            assert(node.children[0].type === 'statement_identifier')
            const subscope = newScope(scope)//, [node.children[0].text])
            return findNeeds(node.children[2], subscope)
        }
        case 'return_statement': {
            return findNeeds(node.children[1], scope)
        }
        case 'try_statement': {
            return findNeedsInStatementBlock(node.children[1], newScope(scope))
        }
        case 'statement_block': {
            return findNeedsInStatementBlock(node, scope)
        }
        case 'switch_statement': {
            assert(node.children[1].type === 'parenthesized_expression')
            assert(node.children[2].type === 'switch_body')
            return findNeeds(node.children[1], scope).concat(
                findNeeds(node.children[2], newScope(scope))
            )
        }
        case 'object':
        case 'array':
        case 'pair':
        case 'augmented_assignment_expression':
        case 'assignment_expression':
        case 'call_expression':
        case 'sequence_expression':
        case 'member_expression':
        case 'do_statement':
        case 'while_statement':
        case 'expression_statement':
        case 'update_expression':
        case 'new_expression':
        case 'subscript_expression':
        case 'unary_expression':
        case 'binary_expression':
        case 'ternary_expression':
        case 'switch_body':
        case 'switch_case':
        case 'switch_default':
        case 'throw_statement': {
            return node.children.flatMap(n => findNeeds(n, scope))
        }
        case '{': case '}':
        case ';': case ':':
        case '&': case '|': case '^': case '~': case '<<': case '>>': case '>>>':
        case '&&': case '||':
        case '[': case ']':
        case '?':
        case ',':
        case '.':
        case '=':
        case '+=': case '-=':
        case '++': case '--':
        case '+': case '-': case '*': case '/': case '%':
        case '!': case '!=': case '!==':
        case '==': case '===':
        case '<': case '>':
        case '<=': case '>=':
        case 'true': case 'false':
        case 'null':
        case 'undefined':
        case 'regex':
        case 'break_statement':
        case 'continue_statement':
        case 'empty_statement':
        case 'number':
        case 'string':
        case 'do': case 'while': case 'for':
        case 'new': case 'case': case 'throw':
        case 'typeof': case 'instanceof':
        case 'in':
        case 'default':
        case 'comment':
        case 'property_identifier': {
            return []
        }
        case 'shorthand_property_identifier':
            return [node.text]
        default:
            logNode(node)
            throw new Error(`todo findNeeds('${node.type}')`)
    }
}


/**
 * Creates a new child scope from the given parent scope
 * @param {DeclarationsInScope|undefined} parentScope 
 * @param {Array<string>} declarations
 * @returns {DeclarationsInScope}
 */
function newScope(parentScope = undefined, declarations = []) {
    return { parentScope, declarations, isFunctionScope: false }
}

/**
 * @param {string} identifier 
 * @param {DeclarationsInScope} scope 
 * @returns {Array<string>} empty array if identifier is known in scope
 */
function wrapIdentifier(identifier, scope) {
    return isDeclaredInScope(identifier, scope) ? [] : [identifier]
}

/**
 * @param {SyntaxNode} node with type `for_statement`
 * @param {DeclarationsInScope} parentScope
 * @returns {Array<string>}
 */
function findNeedsInFunction(node, parentScope) {
    let [_, identifier, formalParameters, statementBlock] = node.children
    switch (identifier.type) {
        case 'identifier':
            insertVariableDeclarationIntoScope(identifier.text, parentScope)
            break
        case 'formal_parameters':
            statementBlock = formalParameters
            formalParameters = identifier
            break
        default:
            throw new Error(`Unexpected first child of function '${identifier.type}'`)
    }

    const params = formalParameters.namedChildren
        .filter(n => n.type === 'identifier')
        .map(n => n.text)
    const scope = newScope(parentScope, params)
    scope.isFunctionScope = true
    return findNeeds(statementBlock, scope)
}

/**
 * @param {SyntaxNode} node with type `for_statement`
 * @param {DeclarationsInScope} parentScope
 * @returns {Array<string>}
 */
function findNeedsInForStatement(node, parentScope) {
    /** @type {DeclarationsInScope} */
    const scope = newScope(parentScope)
    /** @type {Array<Array<string>>} */
    const needs = []

    const cursor = node.walk()
    cursor.gotoFirstChild()

    do {
        switch (cursor.nodeType) {
            case 'for':
            case '(':
            case 'empty_statement':
                break
            case 'variable_declaration':
                // Variable declaration is hoisted out of a for_statement and can be used later.
                // For now, I only implemented one level. Hopefully it won't need more.
                const newVar = parseVariableDeclarations(cursor.currentNode, parentScope)
                if (!newVar) throw new Error(`Could not parse variable declaration '${cursor.currentNode.text}'`)
                if (newVar instanceof Error) {
                    throw newVar
                }
                needs.push(newVar.needs)
                break
            case 'subscript_expression':
            case 'expression_statement':
            case 'update_expression':
            case 'assignment_expression':
            case 'augmented_assignment_expression':
            case 'sequence_expression':
                needs.push(findNeeds(cursor.currentNode, scope))
                break
            case ')':
            case '{':
                break
            case 'statement_block':
                needs.push(findNeedsInStatementBlock(cursor.currentNode, scope))
                break
            case '}':
            case 'comment':
                break
            default:
                logNode(cursor.currentNode)
                throw new Error(`unsupported node type '${cursor.nodeType}' in \`for\` statement`)
        }
    } while (cursor.gotoNextSibling())

    // Assignment_expression can add a variable after it was first referenced.
    // Hoisting of the declaration would be the corred behavior, but this works for now.
    return needs.flat().filter(need => !scope.declarations.includes(need))
}


/**
 * @param {SyntaxNode} node with type `for_statement`
 * @param {DeclarationsInScope} parentScope
 * @returns {Array<string>}
 */
function findNeedsInForInStatement(node, parentScope) {
    /** @type {DeclarationsInScope} */
    const scope = newScope(parentScope, [])
    /** @type {Array<Array<string>>} */
    const needs = []

    const cursor = node.walk()
    cursor.gotoFirstChild()

    assert(cursor.nodeType === 'for')
    assert(cursor.gotoNextSibling())
    // @ts-expect-error TS does not know that we are traversing a structure
    assert(cursor.nodeType === '(')
    assert(cursor.gotoNextSibling())
    assert(cursor.nodeType === 'var')
    assert(cursor.gotoNextSibling())
    assert(cursor.nodeType === 'identifier')
    scope.declarations.push(cursor.currentNode.text)
    assert(cursor.gotoNextSibling())
    assert(cursor.nodeType === 'in')
    assert(cursor.gotoNextSibling())
    needs.push(findNeeds(cursor.currentNode, scope))
    assert(cursor.gotoNextSibling())
    assert(cursor.nodeType === ')')
    assert(cursor.gotoNextSibling())
    assert(cursor.nodeType === 'statement_block')
    needs.push(findNeedsInStatementBlock(cursor.currentNode, scope))
    assert(cursor.gotoNextSibling() === false)

    return needs.flat()
}

/**
 * @param {SyntaxNode} node with type `statement_block`
 * @param {DeclarationsInScope} parentScope 
 */
function findNeedsInStatementBlock(node, parentScope) {
    assert(node.type === 'statement_block')

    const scope = newScope(parentScope)
    /** @type {Array<Array<string>>} */
    const needs = []

    const cursor = node.walk()
    cursor.gotoFirstChild()
    do {
        needs.push(findNeeds(cursor.currentNode, scope))
    } while (cursor.gotoNextSibling())

    return needs.flat()
        // fake hoisting of variable declarations by dropping needs that are in scope
        .filter(need => !scope.declarations.includes(need))
}

/**
 * Returns true if the identifier was declared in the current scope or one of its parents
 * @param {string} identifier 
 * @param {DeclarationsInScope} scope 
 * @returns {boolean}
 */
function isDeclaredInScope(identifier, scope) {
    if (scope.declarations.includes(identifier)) return true
    if (scope.parentScope) return isDeclaredInScope(identifier, scope.parentScope)
    return existsInGlobalScope(identifier)
}

/**
 * Checks a hardcoded list of global identifiers
 * @param {string} identifier 
 * @returns {boolean}
 */
function existsInGlobalScope(identifier) {
    switch (identifier) {
        case 'hljs':
            // elm-explorations/markdown expects highlight.js to be in global scope, see
            // https://github.com/elm-explorations/markdown/tree/1.0.0#code-blocks
            return true
        case 'Array':
        case 'Int8Array':
        case 'Uint8Array':
        case 'Uint8ClampedArray':
        case 'Int16Array':
        case 'Uint16Array':
        case 'Int32Array':
        case 'Uint32Array':
        case 'BigInt64Array':
        case 'BigUint64Array':
        case 'Float32Array':
        case 'Float64Array':
        case 'ArrayBuffer':
        case 'Blob':
        case 'console':
        case 'clearInterval':
        case 'clearTimeout':
        case 'document':
        case 'DataView':
        case 'Date':
        case 'decodeURI':
        case 'encodeURI':
        case 'decodeURIComponent':
        case 'encodeURIComponent':
        case 'Error':
        case 'File':
        case 'FileList':
        case 'history':
        case 'isFinite':
        case 'isNaN':
        case 'Image':
        case 'JSON':
        case 'Object':
        case 'Math':
        case 'MouseEvent':
        case 'navigator':
        case 'requestAnimationFrame':
        case 'setInterval':
        case 'setTimeout':
        case 'String':
        case 'URL':
        case 'window':
        case 'XMLHttpRequest':
            return true
        default:
            return false
    }
}

/**
 * Variable declarations are scoped to functions or global context.
 * This function finds the correct scope in the chain upwards.
 * @param {string} identifier 
 * @param {DeclarationsInScope} scope 
 */
function insertVariableDeclarationIntoScope(identifier, scope) {
    if (scope.isFunctionScope || typeof scope.parentScope === 'undefined') {
        scope.declarations.push(identifier)
    } else return insertVariableDeclarationIntoScope(identifier, scope.parentScope)
}

/**
 * @param {SyntaxNode} node 
 */
function logNode(node) {
    console.log('###')
    console.log(node.text)
    console.log(node)
    console.log(node.children)
}
