// TODO: context.options[0] для выбора Fix to Conditional or If

import property from './lodash-es/property';
import flatMap from './lodash-es/flatMap';
import map from './lodash-es/map';

// NOTE: не работает с чейнингом _.smth.smth.map(...)
export default function(context) {
  const sourceCode = context.getSourceCode();
  const scopeManager = context.getSourceCode().scopeManager;

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
  const isObjectExpression = node => (node.type === 'ObjectExpression' ? true : false);
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

  const isResolvedToObjectDeclaration = node => {
    const arg1Node = node.arguments[0];

    if (node.arguments[0].type === 'ObjectExpression') return false;

    const isDeclaredAsObject = getScope(scopeManager, node).references.some(
      ref =>
        ref.resolved &&
        ref.resolved.name === arg1Node.name &&
        ref.writeExpr &&
        ref.writeExpr.type === 'ObjectExpression',
    );
    return isDeclaredAsObject ? true : false;
  };

  const isResolvedToArrayDeclaration = node => {
    const arg1Node = node.arguments[0];

    if (node.arguments[0].type === 'ArrayExpression') return false;

    const isDeclaredAsArray = getScope(scopeManager, node).references.some(
      ref =>
        ref.resolved &&
        ref.resolved.name === arg1Node.name &&
        ref.writeExpr &&
        ref.writeExpr.type === 'ArrayExpression',
    );
    return isDeclaredAsArray ? true : false;
  };

  const isLodashRedeclarated = node => {
    const lodash = getCaller(node);
    console.log(lodash);
    console.log(getScope(scopeManager, node));
    console.log(
      'lodash was reAssignment in scope of this CallExpression',
      getScope(scopeManager, node).references.some(
        ref =>
          ref.identifier &&
          ref.identifier.parent &&
          ref.identifier.parent.type &&
          ref.identifier.parent.type === 'AssignmentExpression' &&
          ref.identifier.name === '_',
      ),
      console.log(
        'lodash was reDeclared in scope of this CallExpression',
        getScope(scopeManager, node).references.some(
          ref => ref.resolved && ref.resolved.name === '_' && ref.resolved.scope.type !== 'global',
        ),
      ),
    );

    // if (node.arguments[0].type === 'ArrayExpression') return false;

    // const isDeclaredAsArray = getScope(scopeManager, node).references.some(
    //   ref =>
    //     ref.resolved &&
    //     ref.resolved.name === arg1Node.name &&
    //     ref.writeExpr &&
    //     ref.writeExpr.type === 'ArrayExpression',
    // );
    // return isDeclaredAsArray ? true : false;
    return false;
  };

  const isAppropriateMapMethod = node => {
    if (getCaller(node).name !== '_') return false;
    if (getMethodName(node) !== 'map') return false;
    if (node.arguments.length !== 2) return false;

    // Нужно ли вобще фиксить
    if (isLodashRedeclarated(node)) return false;

    // TODO: Не нужно, если _ была переопределена в ближайшем scope
    // NOTE: считаем что _ точно определена в global как lodash и любое
    // переопределение в scope где лежить _.map принимаем за причину не фиксить

    // Не нужно, если это не ObjectExpression
    if (isObjectExpression(node.arguments[0])) return false;

    // TODO: Не нужно, если CallExpression является элементом массива
    // TODO: Не нужно, если CallExpression является элементом объекта

    // TODO: Не нужно, если можно разрезолвить переменную и понять что это объект
    // NOTE: стоит перенести в isObjectExpression
    if (isResolvedToObjectDeclaration(node)) return false;
    if (isResolvedToArrayDeclaration(node)) return false;

    // Не нужно, если _.map в IfStatement:alternate
    // NOTE: пока проверка без возможной инверсии alternate / consequent
    // NOTE: вангую что есть проблема с вложенностью внутри alternate
    if (inIfStatementAlternate(node)) return false;

    // Есди _.map в ConditionalStatement:alternate
    // NOTE: пока проверка без возможной инверсии alternate / consequent
    // NOTE: вангую что есть проблема с вложенностью внутри alternate
    if (inConditionalExpressionAlternate(node)) return false;

    return true;
  };

  return {
    CallExpression(node) {
      // console.log(node);
      console.log(context.getAncestors(node));
      console.log('aaa');

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

        finalFixString = `
          ${
            !isArrayExpression(mapCallExpArg1) ? `if (Array.isArray(${mapCallExpArg1.name})) {` : ''
          }
          ${returnWord} ${
          !isArrayExpression(mapCallExpArg1)
            ? mapCallExpArg1.name
            : context.getSourceCode().getText(mapCallExpArg1)
        }.map(${context.getSourceCode().getText(mapCallExpArg2)})
          ${
            !isArrayExpression(mapCallExpArg1)
              ? `} else {
            ${returnWord} ${mapCallExpString}
          }`
              : ''
          }
          
        `;

        context.report({
          node,
          message: 'Замена',
          fix(fixier) {
            return fixier.replaceText(node, finalFixString);
          },
        });
      }
    },
  };
}
