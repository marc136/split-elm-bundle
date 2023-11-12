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
 *  
 * @param {string} code 
 * @returns {DependencyMap}
 */
export function getDeclarationsAndDependencies(code) {
    const tree = jsParser.parse(code)

    /** @type {DependencyMap} */
    const result = new Map()

    const cursor = tree.walk()
    cursor.gotoFirstChild()

    do {
        /** @type ParsedDeclaration|Error|null */
        let parsed
        switch (cursor.nodeType) {
            case 'variable_declaration':
                parsed = parseVariableDeclaration(cursor.currentNode)
                break
            case 'function_declaration':
                parsed = parseFunctionDeclaration(cursor.currentNode)
                break
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
 * @returns {ParsedDeclaration|Error}
 */
function parseVariableDeclaration(node) {
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
        result.needs = findNeeds(expression, emptyScope())
        return result
    }
    logNode(variableDeclaratorNode)
    return new Error('todo')
}

/**
 * 
 * @param {SyntaxNode} node with type `function_declaration`
 * @returns {ParsedDeclaration|Error}
 */
function parseFunctionDeclaration(node) {
    if (node.childCount !== 4
        || node.children[0].type !== 'function'
        || node.children[1].type !== 'identifier'
        || node.children[2].type !== 'formal_parameters'
        || node.children[3].type !== 'statement_block') {
        return new Error('Invalid shape for a `function_declaration`')
    }
    return {
        name: node.children[1].text,
        needs: findNeeds(node, emptyScope()),
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
            return findNeeds(node.children[3].children[1], { parentScope: scope, declarations: formalParameters })
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
                    case 'function':
                        return findNeeds(n, scope)
                    case 'number':
                        // case 'string':
                        return []
                    case 'object':
                        return findNeeds(n, scope)
                    default:
                        console.log('argumentsnode -> check parent')
                        logNode(node.parent ?? node)
                        logNode(node)
                        throw new Error(`Unexpected arguments named child type ${n.type}`)
                }
            })
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
                default:
                    // return node.namedChildren.flatMap(n => findNeeds(n, scope))
                    throw new Error(`Cannot handle ${node.children[0].type}`)
            }
        }
        case 'identifier':
            return wrapIdentifier(node.text, scope)
        case 'return_statement': {
            return findNeeds(node.children[1], scope)
        }
        case 'object':
        case 'expression_statement':
        case 'unary_expression':
        case 'binary_expression':
        case 'ternary_expression': {
            return node.namedChildren.flatMap(n => findNeeds(n, scope))
        }
        case 'string':
        case 'property_identifier':
        case 'comment': {
            return []
        }
        case 'template_string':
        // unused by Elm
        default:
            logNode(node)
            throw new Error('todo')
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
