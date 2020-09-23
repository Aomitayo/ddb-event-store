const {
  updateExpressionParser: parser
} = require('./ddb-expression-parsers')

const omitArrayElement = prop => arr => arr.filter((v, k) => `[${k}]` !== prop)

const omitObjectProperty = prop => ({ [prop]: _, ...keep }) => keep

const omitProperty = prop =>
  /\[\d+\]/.test(prop) // we are assuming that this will never get called with list index and a non array
    ? omitArrayElement(prop)
    : omitObjectProperty(prop)

const omitByType = path => target => Array.isArray(target)
  ? omitPathFromArray(path, target)
  : omitPathFromObject(path, target)

const omitPathFromArray = (path, arr) => {
  const pathHead = path[0]
  const arrayIndex = parseInt(/\[(\d+)\]/.exec(pathHead)[1])
  const cleaned = omitPath(path.slice(1), arr[arrayIndex])
  return cleaned.length === 0 || Object.keys(cleaned).length === 0
    ? arr.filter((v, k) => k !== arrayIndex)
    : arr.map((v, k) => k === arrayIndex ? cleaned : v)
}

const omitPathFromObject = (path, obj) => {
  const pathHead = path[0]
  const { [pathHead]: target, ...rest } = obj

  const cleaned = typeof target === 'undefined' || target === null
    ? {}
    : omitPath(path.slice(1), target)

  return {
    ...rest,
    ...(Object.keys(cleaned).length === 0 ? {} : { [pathHead]: cleaned })
  }
}

const omitPath = (path, target) =>
  path.length === 1
    ? omitProperty(path[0])(target) // omitPath(path[0], target)
    : omitByType(path)(target)

const ddbUpdateCovers = (ddbUpdate, entity) => {
  const { ExpressionAttributeNames: attrNames = {} } = ddbUpdate

  const {
    SET: setActions
  } = parser.parse(ddbUpdate.UpdateExpression)
  const actionPaths = setActions.map(({ path }) => path.map(attr => attrNames[attr] || attr))
  const uncovered = actionPaths.reduce((e, p) => {
    return omitPath(p, e)
  }, entity)
  console.log('uncovered', uncovered)
}

const ddbUpdateExlusions = (ddbUpdate, entity) => {
  const { ExpressionAttributeNames: attrNames = {} } = ddbUpdate

  const {
    SET: setActions
  } = parser.parse(ddbUpdate.UpdateExpression)
  const actionPaths = setActions.map(({ path }) => path.map(attr => attrNames[attr] || attr))

  return actionPaths.reduce((e, p) => {
    return omitPath(p, e)
  }, entity)
}

exports.ddbAssertions = (chai, utils) => {
  const Assertion = chai.Assertion
  Assertion.addMethod('fullyCovers', function (entity) {
    const assertion = this
    const ddbTransactItem = assertion._obj
    const exclusions = ddbUpdateExlusions(ddbTransactItem, entity)
    assertion.assert(
      Object.keys(exclusions).length === 0,
      `'${ddbTransactItem.UpdateExpression}' does not account for ${JSON.stringify(exclusions, null, 2)}`,
      ` ${ddbTransactItem.UpdateExpression} fully covers ${JSON.stringify(entity, null, 2)}`
    )
  })
}
