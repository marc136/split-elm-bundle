import Parser from 'tree-sitter'
// If unsure about what node types exist in that grammar, 
// open ./node_modules/tree-sitter-javascript/src/node-types.json
// @ts-expect-error no type information given
import JavaScript from 'tree-sitter-javascript'

export const jsParser = new Parser()
jsParser.setLanguage(JavaScript)
