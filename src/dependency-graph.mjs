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
                if ("names" in parsed) {
                    for (const name of parsed.names) {
                        result.set(name, {
                            name, needs: parsed.needs,
                            startIndex: parsed.startIndex, endIndex: parsed.endIndex,
                        })
                    }
                }
                if ("name" in parsed) {
                    result.set(parsed.name, parsed)
                }
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
                    // console.log(`findNeeds(expression, scope)`, expression.text)
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
            return findNeeds(node.children[3], newScope(scope, formalParameters))
        }
        case 'function': {
            assert(node.children[1].type === 'formal_parameters')
            assert(node.children[2].type === 'statement_block')
            const formalParameters = node.children[1].namedChildren
                .filter(n => n.type === 'identifier')
                .map(n => n.text)
            return findNeeds(node.children[2].children[1], newScope(scope, formalParameters))
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
            const result = parseVariableDeclarations(node, scope)
            if (result instanceof Error) {
                throw result
            } else {
                scope.declarations.push(...result.names)
                return result.needs
            }
        }
        case 'variable_declarator': {
            if (node.childCount !== 3 || node.children[0].type !== 'identifier') {
                throw new Error('Unexpected shape of `variable_declarator` node')
            }
            return findNeeds(node.children[2], newScope(scope, [node.children[0].text]))
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
                findNeeds(node.children[2], newScope(scope))
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
        case 'true':
        case 'false':
        case 'null':
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
            case 'expression_statement':
            case 'update_expression':
            case 'assignment_expression':
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

    // Assignment_expression can add a variable after it was first referenced.
    // Hoisting of the declaration would be the corred behavior, but this works for now.
    return needs.flat().filter(need => !scope.declarations.includes(need))
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

    const scope = newScope(parentScope)
    /** @type {Array<Array<string>>} */
    const needs = []

    do {
        /** @type ParsedDeclarations|ParsedDeclaration|Error|null */
        let parsed = null
        switch (cursor.nodeType) {
            case '{':
            case '}':
                break
            case 'variable_declaration':
                parsed = parseVariableDeclarations(cursor.currentNode, scope)
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
            if ("names" in parsed) {
                scope.declarations.push(...parsed.names)
            }
            if ("name" in parsed) {
                scope.declarations.push(parsed.name)
            }
            needs.push(parsed.needs)
        }
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
    // console.log('isDeclaredInScope(', inspect({ identifier, scope }, false, 4))
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
