import property from './lodash-es/property';
import flatMap from './lodash-es/flatMap';
import map from './lodash-es/map';

function getScope(scopeManager, currentNode) {
  const inner = currentNode.type !== 'Program';

  for (let node = currentNode; node; node = node.parent) {
    const scope = scopeManager.acquire(node, inner);

    if (scope) {
      if (scope.type === 'function-expression-name') {
        return scope.childScopes[0];
      }
      return scope;
    }
  }

  return scopeManager.scopes[0];
}

function collectParameterValues(node) {
  switch (node && node.type) {
    case 'Identifier':
      return [node.name];
    case 'ObjectPattern':
      return flatMap(node.properties, prop => collectParameterValues(prop.value));
    case 'ArrayPattern':
      return flatMap(node.elements, collectParameterValues);
    default:
      return [];
  }
}

const getCaller = property(['callee', 'object']);
const getMethodName = property(['callee', 'property', 'name']);

const isArrayExpression = node => (node.type === 'ArrayExpression' ? true : false);
const isObjectExpression = node => (node.type === 'ObjectsExpression' ? true : false);
const isInReturn = node => (node.parent.type === 'ReturnStatement' ? true : false);
// TODO: сделать функцию которая ищем в скоупах и если не находить то false
const variableIsArray = node => false;
const isLodashMap = node => {
  const caller = getCaller(node);
  // поискать в глобале лодашь -> globa scope: Set ?
  // пойдем по пути: если нет определения внутри кода то лодашь в глобале по "_"
  // gпосомтри правило no-use-before-define

  // проверить что его никто не переопределил
  return getCaller(node).name === '_' && getMethodName(node) === 'map';
};

// Проверяем что проверка на массив:
// - нужного аргумента
// - через Array.isArray()
// - TODO: придумать все возможные проверки на массив и проверять их тоже.
//   Например typeof.
const isNativeArrayIsArrayCheck = (node, test, context) => {
  if (getCaller(test).name !== 'Array') return false;
  if (getMethodName(test) !== 'isArray') return false;
  if (test.arguments.length !== 1) return false;
  if (test.arguments[0].name !== node.arguments[0].name) return false;

  return true;
};

// Проверяем, что:
// _.map лежит в IfStatment
// _.map лежит в Alternate
// - IfStatement:Test проверяет первый аргумент из map() на массив с
//   помощью Array.isArray(arg1), без инверсии
// - IfStatemnet:Test вызывает нативный метод Array#map на arg1
const inIfStatementAlternate = mapNode => {
  // поднимаемся по родителям пока parent не станет равным ifStatement у
  // которого в фдеуктфеу текущая нода ?
  let isMapInIf = false;
  let tmpNode = mapNode;
  let ifStatementTest = null;

  while (tmpNode.parent && !isMapInIf) {
    if (
      tmpNode.parent &&
      tmpNode.parent.type === 'IfStatement' &&
      tmpNode.parent.alternate === tmpNode
    ) {
      isMapInIf = true;
      ifStatementTest = tmpNode.parent;
    } else {
      tmpNode = tmpNode.parent;
    }
  }

  if ((isMapInIf && !isNativeArrayIsArrayCheck(mapNode, ifStatementTest.test)) || !isMapInIf)
    return false;

  return true;
};

// Проверяем, что:
// _.map лежит в ConditionalExpression
// _.map лежит в Alternate
// - ConditionalExpression:Test проверяет первый аргумент из map() на массив с
//   помощью Array.isArray(arg1), без инверсии
// - ConditionalExpression:Test вызывает нативный метод Array#map на arg1
const inConditionalExpressionAlternate = mapNode => {
  if (mapNode.parent.type !== 'ConditionalExpression') return false;
  if (mapNode.parent.alternate !== mapNode) return false;
  if (!isNativeArrayIsArrayCheck(mapNode, mapNode.parent.test)) return false;

  return true;
};

const isAppropriateMapMethod = (node, context) => {
  if (getCaller(node).name !== '_') return false;
  if (getMethodName(node) !== 'map') return false;
  if (node.arguments.length !== 2) return false;

  // Нужно ли вобще фиксить

  // Если _.map в IfStatement:alternate
  // NOTE: пока проверка без возможной инверсии alternate / consequent
  if (inIfStatementAlternate(node)) return false;

  // Есди _.map в ConditionalStatement:alternate
  // NOTE: пока проверка без возможной инверсии alternate / consequent
  if (inConditionalExpressionAlternate(node)) return false;
  return true;
};

export default function(context) {
  const sourceCode = context.getSourceCode();
  const globalLodashReference = null;

  return {
    CallExpression(node) {
      console.log(node);
      // не работает с чейнингом
      // нашли CallExpression _.map подходящий под возможность замены
      if (isAppropriateMapMethod(node, context)) {
        const mapCallExpString = context.getSourceCode().getText(node);

        const mapCallExpArg1 = node.arguments[0];
        const mapCallExpArg2 = node.arguments[1];

        let finalFixString = '';
        let returnWord = '';
        let arrayCheckString = '';

        // Нужна ли проверка на массив
        if (!isArrayExpression(node.arguments[0]))
          arrayCheckString = `if (Array.isArray(${mapCallExpArg1}))`;

        // Нужен ли return
        if (isInReturn(node)) returnWord = 'return';

        let finalCheckString = `
          ${
            !isArrayExpression(mapCallExpArg1)
              ? `if (Array.isArray(${mapCallExpArg1.name})) {`
              : null
          }
          ${returnWord} ${mapCallExpArg1.name}.map(${context
          .getSourceCode()
          .getText(mapCallExpArg2)})
          ${!isArrayExpression(mapCallExpArg1) ? `}` : null}
          else {
            ${returnWord} ${mapCallExpString}
          }
        `;

        console.log(finalCheckString);

        context.report({
          node,
          message: 'Замена',
          fix(fixier) {
            console.log();
            return fixier.replaceText(isInReturn(node) ? node.parent : node, finalCheckString);
          },
        });
      }
    },
  };
}
