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
 * @param {string} identifier
 * @param {DependencyMap} map 
 * @returns {Set<string>}
 */
export function getDependenciesOf(identifier, map) {
    return new Set(gatherNeeds(identifier, map))
}

/**
 * Gathers all direct and indirect needs of an identifier in one list.
 * The list may contain duplicate entries.
 * @param {string} identifier
 * @param {DependencyMap} map 
 * @returns {Array<string>}
 */
function gatherNeeds(identifier, map) {
    const direct = map.get(identifier)
    if (!direct) throw new Error(`Unknown identifier '${identifier}'`)
    return direct.needs.concat(direct.needs.flatMap(n => gatherNeeds(n, map)))
}

/**
 * This parses the global scope of the Elm compiler's IIFE output.
 * It only needs a reduced amount of possible declarations compared to the more
 * general and complicated findNeedsInStatementBlock.
 * @param {string} code 
 * @returns {DependencyMap}
 */
export function getDeclarationsAndDependencies(code) {
    /** @type {DependencyMap} */
    const result = new Map()

    const tree = jsParser.parse(code)
    const cursor = tree.walk()
    cursor.gotoFirstChild()

    try {

        /** @type {ParsedDeclaration|Error|null} */
        let parsed = null
        do {
            switch (cursor.nodeType) {
                case 'variable_declaration':
                    parsed = parseVariableDeclaration(cursor.currentNode, emptyScope())
                    break
                case 'function_declaration':
                    parsed = parseFunctionDeclaration(cursor.currentNode, emptyScope())
                    break
                case 'expression_statement':
                // so far only 
                // `console.warn('Compiled in DEV mode. Follow the advice at https://elm-lang.org/0.19.1/optimize for better performance and smaller assets.');`
                case 'comment':
                    //ignore
                    parsed = null
                    break
                default:
                    logNode(cursor.currentNode)
                    parsed = new Error(`unknown node type '${cursor.nodeType}'`)
            }

            if (parsed instanceof Error) {
                throw parsed
            }
            if (parsed) {
                result.set(parsed.name, parsed)
            }
        } while (cursor.gotoNextSibling())

    } catch (ex) {
        console.warn('Failed at position:', { start: cursor.startPosition, end: cursor.endPosition })
        console.warn(cursor.currentNode.text)
        throw ex
    }
    return result
}

/**
 * @typedef ParsedDeclaration
 * @prop {string} name
 * @prop {number} startIndex
 * @prop {number} endIndex
 * @prop {Array<string>} needs
 */

/**
 * 
 * @param {SyntaxNode} node a `VariableDeclarationNode` with type `variable_declaration` 
 * @param {DeclarationsInScope} scope
 * @returns {ParsedDeclaration|Error}
 */
function parseVariableDeclaration(node, scope) {
    if (node.childCount !== 3) {
        return new Error(`Expected a childCount of 3, but got ${node.childCount}`)
    }
    const variableDeclaratorNode = node.children[1]
    if (variableDeclaratorNode.type !== 'variable_declarator') {
        return new Error(`Expected VariableDeclarationNode to contain a VariableDeclaratorNode`)
    }
    /** @type ParsedDeclaration */
    const result = {
        name: variableDeclaratorNode.children[0].text,
        needs: [],
        startIndex: node.startIndex,
        endIndex: node.endIndex,
    }
    if (variableDeclaratorNode.childCount === 1) {
        // empty declaration like `var a;`
        return result
    }
    const [identifier, equals, expression] = variableDeclaratorNode.children
    if (variableDeclaratorNode.childCount === 3
        && identifier.type === 'identifier'
        && equals.type === '=') {
        // TODO rather use a cursor?
        result.needs = findNeeds(expression, scope)
        return result
    }
    logNode(variableDeclaratorNode)
    return new Error('todo')
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
    return {
        name: node.children[1].text,
        needs: findNeeds(node, scope),
        startIndex: node.startIndex,
        endIndex: node.endIndex
    }
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
            assert(node.children[2].type === 'formal_parameters')
            assert(node.children[3].type === 'statement_block')
            const formalParameters = node.children[2].namedChildren
                .filter(n => n.type === 'identifier')
                .map(n => n.text)
            return findNeeds(node.children[3], { parentScope: scope, declarations: formalParameters })
        }
        case 'function': {
            assert(node.children[1].type === 'formal_parameters')
            assert(node.children[2].type === 'statement_block')
            const formalParameters = node.children[1].namedChildren
                .filter(n => n.type === 'identifier')
                .map(n => n.text)
            return findNeeds(node.children[2].children[1], { parentScope: scope, declarations: formalParameters })
        }
        case 'arguments': {
            return node.namedChildren.flatMap(n => {
                switch (n.type) {
                    case 'identifier':
                        return wrapIdentifier(n.text, scope)
                    case 'number':
                    case 'true':
                    case 'false':
                    case 'regex':
                        return []
                    case 'function':
                    case 'object':
                    case 'unary_expression':
                    case 'binary_expression':
                    case 'ternary_expression':
                    case 'call_expression':
                    case 'subscript_expression':
                    case 'array':
                    case 'string':
                        return findNeeds(n, scope)
                    default:
                        console.log('argumentsnode -> check parent if in doubt')
                        logNode(n)
                        console.log(n.toString())
                        throw new Error(`Unexpected arguments named child type ${n.type}`)
                }
            })
        }
        case 'parenthesized_expression': {
            return findNeeds(node.children[1], scope)
        }
        case 'if_statement': {
            return findNeeds(node.children[1], scope).concat(findNeeds(node.children[2], scope))
        }
        case 'for_statement': {
            return findNeedsInForStatement(node, scope)
        }
        case 'variable_declaration': {
            const result = parseVariableDeclaration(node, scope)
            if (result instanceof Error) {
                throw result
            } else {
                scope.declarations.push(result.name)
                return result.needs
            }
        }
        case 'variable_declarator': {
            if (node.childCount !== 3 || node.children[0].type !== 'identifier') {
                throw new Error('Unexpected shape of `variable_declarator` node')
            }
            return findNeeds(node.children[2], { parentScope: scope, declarations: [node.children[0].text] })
        }
        case 'call_expression': {
            if (node.childCount !== 2) {
                throw new Error('Unexpected childCount for a `call_expression`')
            }
            switch (node.children[0].type) {
                case 'member_expression':
                    return findNeeds(node.children[1], scope)
                case 'identifier':
                    // console.warn('call_expression > identifier', node.text, node.children)
                    return wrapIdentifier(node.children[0].text, scope).concat(findNeeds(node.children[1], scope))
                case 'call_expression':
                    return findNeeds(node.children[0], scope)
                default:
                    logNode(node.children[0])
                    // return node.namedChildren.flatMap(n => findNeeds(n, scope))
                    throw new Error(`Cannot handle ${node.children[0].type}`)
            }
        }
        case 'identifier':
            return wrapIdentifier(node.text, scope)
        case 'return_statement': {
            return findNeeds(node.children[1], scope)
        }
        case 'statement_block': {
            return findNeedsInStatementBlock(node, scope)
        }
        case 'switch_statement': {
            assert(node.children[1].type === 'parenthesized_expression')
            assert(node.children[2].type === 'switch_body')
            return findNeeds(node.children[1], scope).concat(
                findNeeds(node.children[2], { parentScope: scope, declarations: [] })
            )
        }
        case 'object':
        case 'array':
        case 'pair':
        case 'assignment_expression':
        case 'member_expression':
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
            return node.namedChildren.flatMap(n => findNeeds(n, scope))
        }
        case 'number':
        case 'string':
        case 'property_identifier':
        case 'comment': {
            return []
        }
        case 'template_string':
        // unused by Elm
        default:
            logNode(node)
            throw new Error(`todo findNeeds('${node.type}')`)
    }
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
    const scope = { parentScope, declarations: [] }
    /** @type {Array<Array<string>>} */
    const needs = []

    const cursor = node.walk()
    cursor.gotoFirstChild()

    do {
        switch (cursor.nodeType) {
            case 'for':
            case '(':
                break
            case 'variable_declaration':
                const newVar = parseVariableDeclaration(cursor.currentNode, parentScope)
                if (!newVar) throw new Error(`Could not parse variable declaration '${cursor.currentNode.text}'`)
                if (newVar instanceof Error) {
                    throw newVar
                }
                scope.declarations.push(newVar.name)
                needs.push(newVar.needs)
                break
            case 'expression_statement':
            case 'update_expression':
                needs.push(findNeeds(cursor.currentNode, scope))
                break
            case ')':
            case '{':
                break
            case 'statement_block':
                needs.push(findNeedsInStatementBlock(cursor.currentNode, scope))
                break
            case '}':
                break
            default:
                logNode(cursor.currentNode)
                throw new Error(`unsupported node type '${cursor.nodeType}' in for statement`)
        }
    } while (cursor.gotoNextSibling())

    return needs.flat()
}

/**
 * 
 * @param {SyntaxNode} node with type `statement_block`
 * @param {DeclarationsInScope} parentScope 
 */
function findNeedsInStatementBlock(node, parentScope) {
    assert(node.type === 'statement_block')
    if (node.childCount === 3) {
        // only one statement inside, take shortcut
        return findNeeds(node.children[1], parentScope)
    }

    const cursor = node.walk()
    cursor.gotoFirstChild()

    /** @type {DeclarationsInScope} */
    const scope = { parentScope, declarations: [] }
    /** @type {Array<Array<string>>} */
    const needs = []

    do {
        /** @type ParsedDeclaration|Error|null */
        let parsed = null
        switch (cursor.nodeType) {
            case '{':
            case '}':
                break
            case 'variable_declaration':
                parsed = parseVariableDeclaration(cursor.currentNode, scope)
                break
            case 'function_declaration':
                parsed = parseFunctionDeclaration(cursor.currentNode, scope)
                break
            case 'if_statement':
                needs.push(findNeeds(node.children[1], scope))
                needs.push(findNeeds(node.children[2], scope))
                break
            case 'for_statement':
                needs.push(findNeedsInForStatement(cursor.currentNode, scope))
                break
            case 'return_statement':
                needs.push(findNeeds(cursor.currentNode, scope))
                break
            case 'expression_statement':
                needs.push(findNeeds(cursor.currentNode, scope))
                break
            case 'comment':
                //ignore
                break
            default:
                logNode(cursor.currentNode)
                parsed = new Error(`unknown node type '${cursor.nodeType}'`)
        }

        if (parsed instanceof Error) {
            throw parsed
        }
        if (parsed) {
            scope.declarations.push(parsed.name)
            needs.push(parsed.needs)
        }
    } while (cursor.gotoNextSibling())

    return needs.flat()
}

/**
 * @returns {DeclarationsInScope}
 */
function emptyScope() {
    return { parentScope: undefined, declarations: [] }
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
        case 'window':
        case 'document':
        case 'Array':
        case 'Error':
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
