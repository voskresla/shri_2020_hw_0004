import property from "./lodash-es/property";
import flatMap from "./lodash-es/flatMap";

window._ = "aaa";

function getScope(scopeManager, currentNode) {
  // On Program node, get the outermost scope to avoid return Node.js special function scope or ES modules scope.
  const inner = currentNode.type !== "Program";

  for (let node = currentNode; node; node = node.parent) {
    const scope = scopeManager.acquire(node, inner);

    if (scope) {
      if (scope.type === "function-expression-name") {
        return scope.childScopes[0];
      }
      return scope;
    }
  }

  return scopeManager.scopes[0];
}

function collectParameterValues(node) {
  switch (node && node.type) {
    case "Identifier":
      return [node.name];
    case "ObjectPattern":
      return flatMap(node.properties, prop =>
        collectParameterValues(prop.value)
      );
    case "ArrayPattern":
      return flatMap(node.elements, collectParameterValues);
    default:
      return [];
  }
}

const getCaller = property(["callee", "object"]);
const getMethodName = property(["callee", "property", "name"]);

const isArrayExpression = node =>
  node.type === "ArrayExpression" ? true : false;
const isObjectExpression = node =>
  node.type === "ObjectsExpression" ? true : false;
const isInReturn = node =>
  node.parent.type === "ReturnStatement" ? true : false;
// TODO: сделать функцию которая ищем в скоупах и если не находить то false
const variableIsArray = node => false;
const isLodashMap = node => {
  const caller = getCaller(node);
  // поискать в глобале лодашь -> globa scope: Set ?
  // пойдем по пути: если нет определения внутри кода то лодашь в глобале по "_"
  // gпосомтри правило no-use-before-define

  // проверить что его никто не переопределил
  return getCaller(node).name === "_" && getMethodName(node) === "map";
};

const isNativeArrayIsArrayCheck = (node, test, context) => {
  // console.log("inNative");
  // console.log("test arg", test.arguments[0]);
  // console.log("node arg", node.arguments[0]);
  // console.log(context.getSourceCode().scopeManager);
  if (getCaller(test).name !== "Array") return false;
  if (getMethodName(test) !== "isArray") return false;
  if (test.arguments.length !== 1) return false;
  if (test.arguments[0].name !== node.arguments[0].name) return false;

  return true;
};
// проверяем что:
// - _.map лежит в тернарке
// - _.map лежит в alternate
// - test - проверяет первый аргумент из map() на массив с помощью Array.isArray(arg1)
// - consequent - вызывает нативный метод Array#map на arg1

// но тогда надо проверять инверсию условий? Если в test лежит !Array
const isMemberOfCorrectTernaryOfArrayCheking = (node, context) => {
  console.log(node);
  if (node.parent.type !== "ConditionalExpression") return false;
  if (node.parent.alternate !== node) return false;
  if (!isNativeArrayIsArrayCheck(node, node.parent.test, context)) return false;
  console.log("fire god ternary");
  return true;
};

const isAppropriateMapMethod = (node, context) => {
  if (getCaller(node).name !== "_") return false;
  if (getMethodName(node) !== "map") return false;
  if (node.arguments.length !== 2) return false;
  if (isArrayExpression(node.arguments[0])) return false;
  if (isMemberOfCorrectTernaryOfArrayCheking(node, context)) return false;
  console.log("fire apropriate method");
  return true;
};

export default function(context) {
  const sourceCode = context.getSourceCode();
  const globalLodashReference = null;

  return {
    // 'Program'(node) {
    //   const scopeManager = context.getSourceCode().scopeManager
    //   // console.log(getScope(scopeManager, node))
    //   console.log(scopeManager)
    //   console.log(scopeManager.globalScope.variables.filter(e => e.name === '_'))
    //   console.log(context.getDeclaredVariables())
    // },

    CallExpression(node) {
      // не работает с чейнингомs
      // нашли CallExpression _.map подходящий под возможность замены
      if (isAppropriateMapMethod(node, context)) {
        console.log("fire map is apropriate for change");
        const arg1 = node.arguments[0];
        const arg2 = node.arguments[1];
        let fullString = "";
        let currentNode = context.getSourceCode().getText(node);
        let returnString = "";

        if (isInReturn(node)) {
          returnString = "return";
        }

        if (variableIsArray(arg1)) {
          // проверка не нужна
        } else {
          // дополняем строку
          fullString = `Array.isArray(${arg1.name}) ?
                ${returnString} ${arg1.name}.map(${arg2.name})
              :
                ${returnString} ${currentNode}
              
              `;
        }

        context.report({
          node,
          message: "blabla",
          fix(fixier) {
            console.log();
            return fixier.replaceText(
              isInReturn(node) ? node.parent : node,
              fullString
            );
          }
        });
      }
      // if (
      //   true &&
      //   getCaller(node).name === "_" &&
      //   getMethodName(node) === "map" &&
      //   node.arguments.length === 2 &&
      //   !isArrayExpression(node.arguments[0])

      //   // && !isObjectExpression(node.arguments[0])
      // ) {
      //   const scopeManager = context.getSourceCode().scopeManager;
      //   console.log(getScope(scopeManager, node));
      //   console.log("arg1:", node.arguments[0]);
      //   console.log("arg2:", node.arguments[1]);
      //   // isMemberOfTernary(node)
      //   const arg1 = node.arguments[0];
      //   const arg2 = node.arguments[1];
      //   // формируем замену
      //   let fullString = "";
      //   let currentNode = context.getSourceCode().getText(node);
      //   let returnString = "";

      //   if (isInReturn(node)) {
      //     returnString = "return";
      //   }

      //   if (variableIsArray(arg1)) {
      //     // проверка не нужна
      //   } else {
      //     // дополняем строку
      //     fullString = `if (Array.isArray(${arg1.name})) {
      //           ${returnString} ${arg1.name}.map(${arg2.name})
      //         } else {
      //           ${returnString} ${currentNode}
      //         }
      //         `;
      //   }

      //   context.report({
      //     node,
      //     message: "blabla",
      //     fix(fixier) {
      //       console.log();
      //       return fixier.replaceText(
      //         isInReturn(node) ? node.parent : node,
      //         fullString
      //       );
      //     }
      //   });
      // }

      // if (getCaller(node).name == '_') {
      //   console.log(node)
      // }
      // нашел кто зовет метод
      // console.log(getCaller(node).name)
      // console.log(node.arguments)

      // console.log(collectParameterValues(node.arguments[0]))
      // нашел название метода
      // console.log(getMethodName(node))

      // проверить аргументы метода: что их 2, что первый не объект, не arrayDedclaration, определен в scope, если не определен то похуй

      const sourceCode = context.getSourceCode();

      // if (node.name && node.name == "map") {
      //   const xxx = getScope(sourceCode.scopeManager, node);
      //   console.log("get scope", xxx);
      //   console.log(node);
      //   //console.log('var',context.getDeclaredVariables(node))
      //   const firstArgument = node.parent.parent.arguments[0];
      //   //console.log(sourceCode.scopeManager.acquire(firstArgument));
      //   console.log(`collection scope:`, getScope(sourceCode.scopeManager, firstArgument));
      //   const secondArgument = node.parent.parent.arguments[1];

      //   const startPosition = node.parent.object.start; // 36
      //   const lastPosition = node.parent.parent.end; // 86

      //   const txt = `if () {return ${firstArgument.name}.map(${sourceCode.getText(secondArgument)}) }`;
      //   context.report({
      //     node,
      //     message: "blabla",
      //     fix(fixier) {
      //       //console.log(startPosition)
      //       //return fixier.replaceTextRange([startPosition, lastPosition], txt)
      //     }
      //   });
      // }
    }
  };
}
