/**
 * @fileoverview map
 * @author Stepan Polevshchikov
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require('../../../lib/rules/map'),
  RuleTester = require('eslint').RuleTester;

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

var ruleTester = new RuleTester({ parserOptions: { ecmaVersion: 6 } });
ruleTester.run('Simple test', rule, {
  valid: [
    '[].map(fn)',
    '_.map("string",fn)',
    'Array.isArray(x)?x.map(fn):_.map(x,fn)',
    'if (Array.isArray(x)) { x.map(fn) } else { _.map(x,fn) } ',
  ],

  invalid: [
    {
      code: '_.map(collection, fn)',
      output: `if (Array.isArray(collection)) {\r\n collection.map(fn)\r\n} else {\r\n _.map(collection, fn)\r\n}`,
      errors: [
        {
          message: 'Будем фиксить c проверкой, потому что неизвестно что в аргументе:',
          type: 'CallExpression',
        },
      ],
    },
    {
      code: '_.map([], fn)',
      output: `[].map(fn)`,
      errors: [
        {
          message: 'Будем фиксить без проверки, потому что аргумент Array:',
          type: 'CallExpression',
        },
      ],
    },
  ],
});

ruleTester.run('Reassignment && Redeclaration', rule, {
  valid: [
    '_ = 0; _.map("string",fn)',
    'let _ = 0; _.map("string",fn)',
    'let a = []; { a = 0; _.map(a,fn) }',
  ],

  invalid: [
    {
      code: 'let a = []; { _.map(a,fn) }',
      output: `let a = []; { a.map(fn) }`,
      errors: [
        {
          message: 'Будем фиксить без проверки, потому что аргумент Array:',
          type: 'CallExpression',
        },
      ],
    },
    {
      code: 'let a = []; { a = 0; _.map(a, fn) }; _.map(a,fn2)',
      parserOptions: { ecmaVersion: 6 },
      output: `options`,
      errors: [
        {
          message: 'Будем фиксить без проверки, потому что аргумент Array:',
          type: 'CallExpression',
        },
      ],
    },
  ],
});
