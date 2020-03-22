// import eslintScope from 'eslint-scope';
//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
  meta: {
    docs: {
      description: 'map',
      category: 'Fill me in',
      recommended: false,
    },
    fixable: 'code', // or "code" or "whitespace"
    schema: [
      // fill in your schema
    ],
  },

  create(context) {
    // variables should be defined here
    // const scopeManager = context.getScope();
    // console.log(scopeManager);
    // console.log(context.getSourceCode());
    // const scopeManager = eslintScope.analyze(context.getSourceCode().ast);
    const scopeManager = context.getSourceCode().scopeManager;
    //----------------------------------------------------------------------
    // Helpers
    //----------------------------------------------------------------------
    const getScope = (scopeManager, currentNode) => {
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
    };
    const getCaller = node => node.callee.object;
    const getMethodName = node => node.callee.property.name;
    const isArrayExpression = node => (node.type === 'ArrayExpression' ? true : false);
    const isObjectExpression = node => (node.type === 'ObjectExpression' ? true : false);
    const isInReturn = node => (node.parent.type === 'ReturnStatement' ? true : false);
    // TODO: сделать функцию которая ищем в скоупах и если не находить то false
    const variableIsArray = node => false;
    // Проверяем что проверка на массив праивльная:
    // - нужного аргумента
    // - через Array.isArray()
    // - TODO: придумать все возможные проверки на массив и проверять их тоже.
    //   Например typeof. И проверять через подобие enum.
    const isIsArrayCheck = (node, test, context) => {
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
    const inCorrectIfStatementAlternate = mapNode => {
      // поднимаемся по родителям пока parent не станет равным ifStatement у
      // которого в alternate текущая нода ?
      // NOTE: проверка через context.ancestros не нравится, потому что анцесторов
      // может быть очень много. Снизу подниматься выглядит дешевле.
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

      if ((isMapInIf && !isIsArrayCheck(mapNode, ifStatementTest.test)) || !isMapInIf) return false;

      return true;
    };
    // Проверяем, что:
    // _.map лежит в ConditionalExpression
    // _.map лежит в Alternate
    // - ConditionalExpression:Test проверяет первый аргумент из map() на массив с
    //   помощью Array.isArray(arg1), без инверсии
    // - ConditionalExpression:Test вызывает нативный метод Array#map на arg1
    const inCorrectConditionalExpressionAlternate = mapNode => {
      if (mapNode.parent.type !== 'ConditionalExpression') return false;
      if (mapNode.parent.alternate !== mapNode) return false;
      if (!isIsArrayCheck(mapNode, mapNode.parent.test)) return false;

      return true;
    };
    // TODO: работает только с VariableDeclaration, переделать на
    // VariableDeclaration + AssignmentExpression
    const isResolvedToObjectDeclaration = (node, scopeManager) => {
      let scope = getScope(scopeManager, node);
      let result = false;
      let exit = false;

      while (scope && !exit) {
        scope.references.forEach(ref => {
          // Если переменная резолвиться как объект в первом ближайшем scope - не фиксим
          if (ref.resolved && ref.resolved.name === node.arguments[0].name && ref.writeExpr) {
            result = ref.writeExpr.type === 'ObjectExpression';
            exit = true;
            return;
          }

          // if (ref.resolved && ref.resolved.name === node.arguments[0].name && ref.writeExpr) {
          //   result = !ref.writeExpr.type === 'ObjectExpression';
          //   exit = true;
          //   return;
          // }

          if (
            ref.identifier &&
            ref.identifier.name === node.arguments[0].name &&
            ref.identifier.parent &&
            ref.identifier.parent.type === 'AssignmentExpression'
          ) {
            result = ref.writeExpr && ref.writeExpr.type === 'ObjectExpression';
            exit = true;
            return;
          }

          // if (
          //   ref.identifier &&
          //   ref.identifier.name === node.arguments[0].name &&
          //   ref.identifier.parent &&
          //   ref.identifier.parent.type === 'AssignmentExpression'
          // ) {
          //   result = !ref.writeExpr && ref.writeExpr.type === 'ObjectExpression';
          //   exit = true;
          //   return;
          // }
        });

        scope = scope.upper;
      }

      return result;
    };
    // TODO: работает только с VariableDeclaration, переделать на
    // VariableDeclaration + AssignmentExpression
    const isResolvedToArrayDeclaration = (node, scopeManager) => {
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

    const isLodashRedeclaratedOrReassignment = (node, scopeManager) => {
      // const lodash = getCaller(node);
      // console.log(lodash);
      console.log(getScope(scopeManager, node));
      //   console.log('scopeManager in isLodash', scopeManager);
      //   console.log(getScope(scopeManager, node));
      console.log(
        'lodash was reAssignment in scope of this CallExpression',
        getScope(scopeManager, node).references.some(
          ref =>
            ref.identifier &&
            ref.identifier.parent &&
            ref.identifier.parent.type &&
            ref.identifier.parent.type === 'AssignmentExpression' &&
            ref.identifier.name &&
            ref.identifier.name === '_',
        ),
      );
      console.log(
        'lodash was reDeclared in scope of this CallExpression',
        getScope(scopeManager, node).references.some(
          ref => ref.resolved && ref.resolved.name === '_' && ref.resolved.scope.type !== 'global',
        ),
      );

      return false;
    };

    const isMapArgResolvedToFixable = (node, scopeManager) => {
      let scope = getScope(scopeManager, node);
      let result = false;
      let exit = false;

      while (scope && !exit) {
        scope.references.forEach(ref => {
          // Если переменная резолвиться как массив в первом ближайшем scope - не фиксим
          if (ref.resolved && ref.resolved.name === node.arguments[0].name && ref.writeExpr) {
            result = ref.writeExpr.type === 'ArrayExpression';
            exit = true;
            return;
          }

          // if (ref.resolved && ref.resolved.name === node.arguments[0].name && ref.writeExpr) {
          //   result = !ref.writeExpr.type === 'ObjectExpression';
          //   exit = true;
          //   return;
          // }

          if (
            ref.identifier &&
            ref.identifier.name === node.arguments[0].name &&
            ref.identifier.parent &&
            ref.identifier.parent.type === 'AssignmentExpression'
          ) {
            result = ref.writeExpr && ref.writeExpr.type === 'ArrayExpression';
            exit = true;
            return;
          }

          // if (
          //   ref.identifier &&
          //   ref.identifier.name === node.arguments[0].name &&
          //   ref.identifier.parent &&
          //   ref.identifier.parent.type === 'AssignmentExpression'
          // ) {
          //   result = !ref.writeExpr && ref.writeExpr.type === 'ObjectExpression';
          //   exit = true;
          //   return;
          // }
        });

        scope = scope.upper;
      }

      return result;
    };

    const isAppropriateMapMethod = (node, scopeManager) => {
      if (getCaller(node).name !== '_') return false;
      if (getMethodName(node) !== 'map') return false;
      if (node.arguments.length !== 2) return false;

      // if (isMapArgResolvedToFixable(node, scopeManager)) return false;
      // Нужно ли вобще фиксить

      // TODO: Не нужно, если _ была переопределена в ближайшем scope
      // NOTE: считаем что _ точно определена в global как lodash и любое
      // переопределение в scope где лежить _.map принимаем за причину не фиксить
      if (isLodashRedeclaratedOrReassignment(node, scopeManager)) return false;

      // Не нужно, если это не ObjectExpression
      if (isObjectExpression(node.arguments[0])) return false;

      // TODO: Не нужно, если CallExpression является элементом массива
      // потому что конструкция [if () {} else {}] не может быть элементом массива
      // но можно фиксить если в options выбрано ternary:true

      // TODO: Не нужно, если CallExpression является элементом объекта
      // аналогично элементу массива

      // TODO: Не нужно, если можно разрезолвить переменную и понять что это объект
      // NOTE: стоит перенести в isObjectExpression
      if (isResolvedToObjectDeclaration(node, scopeManager)) return false;
      // if (isResolvedToArrayDeclaration(node, scopeManager)) return false;

      // Не нужно, если _.map в IfStatement:alternate и в IfStatement:Test
      // проверка первого аргумента на массив
      // NOTE: пока проверка без возможной инверсии alternate / consequent
      // NOTE: вангую что есть проблема с вложенностью внутри alternate
      if (inCorrectIfStatementAlternate(node)) return false;

      // Есди _.map в ConditionalStatement:alternate и в ConditionalStatement:Test
      // проверка первого аргумента на массив
      // NOTE: пока проверка без возможной инверсии alternate / consequent
      // NOTE: вангую что есть проблема с вложенностью внутри alternate
      if (inCorrectConditionalExpressionAlternate(node)) return false;

      return true;
    };

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    return {
      CallExpression(node) {
        if (isAppropriateMapMethod(node, scopeManager)) {
          const mapCallExpString = context.getSourceCode().getText(node);
          const mapCallExpArg1 = node.arguments[0];
          const mapCallExpArg2 = node.arguments[1];

          let finalFixString = '';
          let returnWord = '';
          let arrayCheckString = '';

          // Нужен ли return
          if (isInReturn(node)) returnWord = 'return';

          finalFixString = `
                ${
                  !isMapArgResolvedToFixable(node, scopeManager)
                    ? `if (Array.isArray(${mapCallExpArg1.name})) {`
                    : ''
                }
                ${returnWord} ${
            !isMapArgResolvedToFixable(node, scopeManager)
              ? mapCallExpArg1.name
              : context.getSourceCode().getText(mapCallExpArg1)
          }.map(${context.getSourceCode().getText(mapCallExpArg2)})
                ${
                  !isMapArgResolvedToFixable(node, scopeManager)
                    ? `} else {
                  ${returnWord} ${mapCallExpString}
                }`
                    : ''
                }
                
              `;

          context.report({
            node,
            message: 'Use native map instead lodash#map',
            fix(fixier) {
              return fixier.replaceText(node, finalFixString);
            },
          });
        }
      },
    };
  },
};
