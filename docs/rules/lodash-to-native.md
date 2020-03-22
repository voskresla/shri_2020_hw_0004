# map (lodash-to-native)

Правило ищет исполльзования lodash#Map и, если это возможно, заменяет на
Array#map

- Если аргумент Identifier и можно четко определить во что он резолвится для
  этого scope, то:
  - Если в ObjectExpression / Literal => не фиксим
  - Если в ArrayExpression => фиксим без проверки
- Если аргумент ArrayExpression => фиксим без проверки
- Если аргумент ObjectExpression / Literal => не фиксим
- Если переменная \_ была Redeclarated / Reasignment => не фиксим.

# Не сделано

- Не добавил возможность выбора в какую конструкцию фиксить (IfStatemnet /
  ConditionalExpression)
- Не работает с chaining'ом lodash

## Rule Details

Examples of **incorrect** code for this rule:

```js
return _.map(collection, fn);
```

Examples of **correct** code for this rule:

```js
if (проверка, что collection - это массив) {
    return collection.map(fn);
} else {
    return _.map(collection, fn);
}
```
