import assert from 'node:assert';
import { inspect } from 'node:util';
import { jsParser } from './js-parser.mjs';

/**
 * @typedef { import('tree-sitter').SyntaxNode} SyntaxNode
 */

/**
 * @typedef {Map<string, ParsedDeclaration>} DependencyMap
 */


/**
 * Gathers all direct and indirect needs of an identifier in one Set.
 * 
 * @param {string} identifier
 * @param { { declarations: DependencyMap } } map 
 * @returns {Set<string>}
 */
export function getDependenciesOf(identifier, { declarations }) {
    const result = new Set()
    let queue = [identifier]
    do {
        const id = queue.shift()
        if (!id) break
        if (!result.has(id)) {
            const direct = declarations.get(id)
            if (!direct) {
                throw new Error(`Unknown identifier '${id}'`)
            }
            result.add(direct.name)
            queue.push(...direct.needs)
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
 * @returns {{ declarations: DependencyMap, unnamed: Array<ParsedDeclarations> }}
 */
export function getDeclarationsAndDependencies(code) {
    /** @type {DependencyMap} */
    const declarations = new Map()
    /** @type {Array<ParsedDeclarations} */
    const unnamed = []

    const tree = jsParser.parse(code)
    const cursor = tree.walk()
    cursor.gotoFirstChild()

    try {

        /** @type {ParsedDeclaration|ParsedDeclarations|Error|null} */
        let parsed = null
        do {
            switch (cursor.nodeType) {
                case 'variable_declaration':
                    parsed = parseVariableDeclarations(cursor.currentNode, newScope())
                    break
                case 'function_declaration':
                    parsed = parseFunctionDeclaration(cursor.currentNode, newScope())
                    break
                case 'try_statement':
                    const needs = findNeeds(cursor.currentNode, newScope())
                    if (Array.isArray(needs) && needs.length > 0) {
                        /** @type ParsedDeclarations */
                        const parsed = { names: [], needs, startIndex: cursor.startIndex, endIndex: cursor.endIndex }
                        unnamed.push(parsed)
                    }
                    break
                case 'expression_statement':
                // so far only 
                // `console.warn('Compiled in DEV mode. Follow the advice at https://elm-lang.org/0.19.1/optimize for better performance and smaller assets.');`
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
 * @typedef ParsedDeclaration
 * @prop {string} name
 * @prop {number} startIndex
 * @prop {number} endIndex
 * @prop {Array<string>} needs
 */

/**
 * @typedef ParsedDeclarations
 * @prop {Array<string>} names
 * @prop {number} startIndex
 * @prop {number} endIndex
 * @prop {Array<string>} needs
 */

/**
 * 
 * @param {SyntaxNode} node a `VariableDeclarationNode` with type `variable_declaration` 
 * @param {DeclarationsInScope} scope is mutated
 * @returns {ParsedDeclarations|Error}
 */
function parseVariableDeclarations(node, scope) {
    const cursor = node.walk()
    cursor.gotoFirstChild()

    /** @type ParsedDeclarations */
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
                scope.declarations.push(identifier.text)
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
 * 
 * @param {SyntaxNode} node with type `function_declaration`
 * @param {DeclarationsInScope} scope
 * @returns {ParsedDeclaration|Error}
 */
function parseFunctionDeclaration(node, scope) {
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
    scope.declarations.push(name)

    const formalParameters = node.children[2].namedChildren
        .filter(n => n.type === 'identifier')
        .map(n => n.text)

    const needs = findNeeds(node.children[3], newScope(scope, formalParameters))

    return { name, needs, startIndex: node.startIndex, endIndex: node.endIndex }
}

/**
 * 
 * @param {SyntaxNode} node with type `function_declaration`
 * @param {DeclarationsInScope} scope
 * @returns {ParsedDeclaration|Error}
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
 * 
 * @param {SyntaxNode} node with type `function_declaration`
 * @param {DeclarationsInScope} scope
 * @returns {ParsedDeclaration|Error}
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
 * 
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
            assert(node.children[1].type === 'formal_parameters')
            assert(node.children[2].type === 'statement_block')
            const formalParameters = node.children[1].namedChildren
                .filter(n => n.type === 'identifier')
                .map(n => n.text)
            return findNeeds(node.children[2], newScope(scope, formalParameters))
        }
        case 'arguments': {
            return node.namedChildren.flatMap(n => findNeeds(n, scope))
        }
        case 'parenthesized_expression': {
            return findNeeds(node.children[1], scope)
        }
        case 'if_statement': {
            // return findNeeds(node.children[1], scope).concat(findNeeds(node.children[2], scope))
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
        case '&&': case '||': case '|':
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
        case 'template_string':
        // unused by Elm
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
    return { parentScope, declarations }
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
 * @typedef DeclarationsInScope
 * @prop {DeclarationsInScope|undefined} parentScope
 * @prop {Array<string>} declarations
 */

/**
 * 
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
                throw new Error(`unsupported node type '${cursor.nodeType}' in for statement`)
        }
    } while (cursor.gotoNextSibling())

    // Assignment_expression can add a variable after it was first referenced.
    // Hoisting of the declaration would be the corred behavior, but this works for now.
    return needs.flat().filter(need => !scope.declarations.includes(need))
}


/**
 * 
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
 * 
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
    switch (identifier) {
        case 'Array':
        case 'console':
        case 'document':
        case 'DataView':
        case 'Error':
        case 'File':
        case 'FileList':
        case 'Object':
        case 'Math':
        case 'String':
        case 'window':
            return true
        default:
            return false
    }
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
