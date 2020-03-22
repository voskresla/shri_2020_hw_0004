// import eslintScope from 'eslint-scope';
//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------
const eslintScope = require('eslint-scope');
module.exports = {
  meta: {
    docs: {
      description: 'map',
      category: 'Fill me in',
      recommended: false,
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const scopeManager = eslintScope.analyze(context.getSourceCode().ast);
    // const scopeManager = context.getSourceCode().scopeManager;
    //----------------------------------------------------------------------
    // Helpers
    //----------------------------------------------------------------------

    // Получаем ближайший scope ноды
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

    // Проверяем есть ли перед нодой ReturnStatement
    const isInReturn = node => (node.parent.type === 'ReturnStatement' ? true : false);

    const isIsArrayCheck = (node, test) => {
      return (
        getCaller(test).name === 'Array' &&
        getMethodName(test) == 'isArray' &&
        test.arguments.length == 1 &&
        test.arguments[0].name === node.arguments[0].name
      );
    };

    const inCorrectIfStatementAlternate = mapNode => {
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

    const inCorrectConditionalExpressionAlternate = mapNode => {
      if (mapNode.parent.type !== 'ConditionalExpression') return false;
      if (mapNode.parent.alternate !== mapNode) return false;
      if (!isIsArrayCheck(mapNode, mapNode.parent.test)) return false;

      return true;
    };

    const isLodashRedeclaratedOrReassignment = (node, scopeManager) => {
      let scope = getScope(scopeManager, node);
      let result = false;
      let exit = false;
      const reDeclarated = ref =>
        ref.resolved && ref.resolved.name === '_' && ref.resolved.scope.type !== 'global';
      const reAssignment = ref =>
        ref.identifier &&
        ref.identifier.parent &&
        ref.identifier.parent.type &&
        ref.identifier.parent.type === 'AssignmentExpression' &&
        ref.identifier.name &&
        ref.identifier.name === '_';

      while (scope && !exit) {
        // TODO: исправь, некрасиво два раза
        if (scope.references.some(reAssignment)) {
          result = true;
          exit = true;
        }
        if (scope.references.some(reDeclarated)) {
          result = true;
          exit = true;
        }

        scope = scope.upper;
      }

      return result;
    };

    const isAppropriateMapMethod = node => {
      return (
        getCaller(node).name === '_' && getMethodName(node) === 'map' && node.arguments.length === 2
      );
    };

    const whatIsArg = (node, scopeManager) => {
      let scope = getScope(scopeManager, node);
      let result = false;
      let exit = false;

      if (node.arguments[0].type !== 'Identifier') {
        result = node.arguments[0].type;
      } else {
        while (scope && !exit) {
          scope.references.forEach(ref => {
            if (ref.resolved && ref.resolved.name === node.arguments[0].name && ref.writeExpr) {
              result = ref.writeExpr.type;
              exit = true;
              return;
            }
            if (
              ref.identifier &&
              ref.identifier.name === node.arguments[0].name &&
              ref.identifier.parent &&
              ref.identifier.parent.type === 'AssignmentExpression' &&
              ref.writeExpr
            ) {
              result = ref.writeExpr.type;
              exit = true;
              return;
            }
          });

          scope = scope.upper;
        }
      }

      return result ? result : 'unknown';
    };

    // Формируем фиксы

    const dontFix = node => {
      const mapCallExpString = context.getSourceCode().getText(node);

      return {
        node,
        message: 'Не будем фиксить, потому что аргумент или Literal, или ObjectExpression:',
        fix(fixier) {
          return fixier.replaceText(node, mapCallExpString);
        },
      };
    };

    const fixWithOutCheck = node => {
      const mapCallExpArg1 = context.getSourceCode().getText(node.arguments[0]);
      const mapCallExpArg2 = context.getSourceCode().getText(node.arguments[1]);
      const fixString = `${mapCallExpArg1}.map(${mapCallExpArg2})`;

      return {
        node,
        message: 'Будем фиксить без проверки, потому что аргумент Array:',
        fix(fixier) {
          return fixier.replaceText(node, fixString);
        },
      };
    };
    const fixWithCheck = node => {
      const mapCallExpString = context.getSourceCode().getText(node);
      const mapCallExpArg1 = context.getSourceCode().getText(node.arguments[0]);
      const mapCallExpArg2 = context.getSourceCode().getText(node.arguments[1]);

      const returnStr = isInReturn(node) ? 'return' : '';
      const arrayCheckStr = `if (Array.isArray(${mapCallExpArg1}))`;

      const startRange = isInReturn(node) ? node.parent.start : node.start;
      const endRange = isInReturn(node) ? node.parent.end : node.end;

      const fixString = `${arrayCheckStr} {\r\n${returnStr} ${mapCallExpArg1}.map(${mapCallExpArg2})\r\n} else {\r\n${returnStr} ${mapCallExpString}\r\n}`;

      return {
        node,
        message: 'Будем фиксить c проверкой, потому что неизвестно что в аргументе:',

        fix(fixier) {
          return fixier.replaceTextRange([startRange, endRange], fixString);
        },
      };
    };

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    return {
      CallExpression(node) {
        if (isAppropriateMapMethod(node, scopeManager)) {
          let report;

          if (
            isLodashRedeclaratedOrReassignment(node, scopeManager) ||
            inCorrectIfStatementAlternate(node) ||
            inCorrectConditionalExpressionAlternate(node)
          )
            return (report = dontFix(node));

          switch (whatIsArg(node, scopeManager)) {
            case 'unknown':
              report = fixWithCheck(node);
              break;
            case 'Identifier':
              report = fixWithCheck(node);
              break;
            case 'ArrayExpression':
              report = fixWithOutCheck(node);
              break;
            default:
              report = dontFix(node);
              break;
          }

          context.report(report);
        }
      },
    };
  },
};
