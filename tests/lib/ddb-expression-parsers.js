const peg = require('pegjs')

const tmp = `
  ('REMOVE'i removeAction (',' removeAction)* (keyword removeAction (',' removeAction)*)*)?
  ('ADD'i addAction (',' addAction)* (keyword addAction (',' addAction)*)*)?
  ('DELETE'i deleteAction (',' deleteAction)* (keyword deleteAction (',' deleteAction)*)*)?
`
const ddbUpdateExprGrammer = `
start = updateExpr

updateExpr =
  keyword:'SET'i _ action:setAction otherActions:(_ ',' _ setAction)*
  {
    return {
      [keyword]: [action, ...(otherActions.map(([, , , a]) => a)) ]
    }
  }

setAction =
  path:path _ '=' _ value:value
  {
    return {path, value}
  }

value =
  additiveExpr
  / operand

additiveExpr =
  l:operand _ op:('+' / '-') _ r:operand { return [l, op, r].join(' ') }

operand =
  path
  / attributeValuePlaceholder
  / function

path =
  attr:expressionAttribute subPaths:subPath*
  {
    return [attr, ...[].concat(...subPaths)]
  }

expressionAttribute =
  (attributeName / attributePlaceholder)

attributeName =
  char:[a-zA-Z] chars:[a-zA-Z0-9]* { return char + chars.join('') }

attributePlaceholder =
  '#' chars:[a-zA-Z0-9]+
  {
    return '#' + chars.join('')
  }

attributeValuePlaceholder =
  ':' chars:[a-zA-Z0-9]+
  {
    return ':' + chars.join('')
  }

subPath =
  listElementSubPath / mapElementSubPath

mapElementSubPath =
  '.' attr:expressionAttribute { return [attr] }

listElementSubPath =
  '[' elementIndex:[0-9]+ ']' subPaths:subPath* {return [ '[' + elementIndex + ']', ...[].concat(...subPaths)]}

function =
  'list_append(' listRef ',' listRef ')'
  / 'if_not_exists(' path ',' value ')'

listRef = attributePlaceholder / attributeValuePlaceholder

_ = [ \\t\\n\\r]*

`
exports.updateExpressionParser = peg.generate(ddbUpdateExprGrammer)
