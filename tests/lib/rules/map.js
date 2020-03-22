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

var ruleTester = new RuleTester();
ruleTester.run('map', rule, {
  valid: ['[].map(fn)'],

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
  ],
});
