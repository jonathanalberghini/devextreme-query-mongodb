/* global suite, test */

const chai = require('chai');
const assert = chai.assert;

const pipelines = require('./pipelines');
const {
  createGroupKeyPipeline,
  createGroupingPipeline,
  createSkipTakePipeline,
  createCountPipeline,
  createMatchPipeline
} = pipelines;
const {
  createGroupStagePipeline,
  construct,
  constructRegex,
  parseFilter
} = pipelines.testing;

suite('pipelines', function() {
  suite('createGroupKeyPipeline', function() {
    test('no groupInterval', function() {
      const result = createGroupKeyPipeline('sel', null, 0, 0);
      const wanted = [{ $addFields: { ___group_key_0: '$sel' } }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.equal(result.groupIndex, 0);
    });

    test('numeric groupInterval', function() {
      const result = createGroupKeyPipeline('sel', 15, 0, 0);
      const wanted = [
        {
          $addFields: {
            ___group_key_0: { $subtract: ['$sel', { $mod: ['$sel', 15] }] }
          }
        }
      ];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.equal(result.groupIndex, 0);
    });

    const basicNamedGroupIntervalTest = (name, tzo, mongoModName) => {
      const result = createGroupKeyPipeline('sel', name, 0, tzo);
      const wanted = [
        {
          $addFields: {
            ___group_key_0: {
              [`$${mongoModName || name}`]: {
                $subtract: ['$sel', tzo * 60 * 1000]
              }
            }
          }
        }
      ];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.equal(result.groupIndex, 0);
    };

    test('groupInterval year, timezoneOffset 0', function() {
      basicNamedGroupIntervalTest('year', 0);
    });

    test('groupInterval year, timezoneOffset 60', function() {
      basicNamedGroupIntervalTest('year', 60);
    });

    test('groupInterval quarter, timezoneOffset 60', function() {
      const result = createGroupKeyPipeline('sel', 'quarter', 0, 60);
      const wanted = [
        {
          $addFields: {
            ___mp2: { $add: [{ $month: { $subtract: ['$sel', 3600000] } }, 2] }
          }
        },
        {
          $addFields: {
            ___group_key_0: {
              $divide: [{ $subtract: ['$___mp2', { $mod: ['$___mp2', 3] }] }, 3]
            }
          }
        }
      ];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.equal(result.groupIndex, 0);
    });

    test('groupInterval month, timezoneOffset 60', function() {
      basicNamedGroupIntervalTest('month', 60);
    });

    test('groupInterval day, timezoneOffset 60', function() {
      basicNamedGroupIntervalTest('day', 60, 'dayOfMonth');
    });

    test('groupInterval dayOfWeek, timezoneOffset 60', function() {
      const result = createGroupKeyPipeline('sel', 'dayOfWeek', 0, 60);
      const wanted = [
        {
          $addFields: {
            ___group_key_0: {
              $subtract: [{ $dayOfWeek: { $subtract: ['$sel', 3600000] } }, 1]
            }
          }
        }
      ];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.equal(result.groupIndex, 0);
    });

    test('groupInterval hour, timezoneOffset 60', function() {
      basicNamedGroupIntervalTest('hour', 60);
    });

    test('groupInterval minute, timezoneOffset 60', function() {
      basicNamedGroupIntervalTest('minute', 60);
    });

    test('groupInterval second, timezoneOffset 60', function() {
      basicNamedGroupIntervalTest('second', 60);
    });

    test('unknown groupInterval', function() {
      const result = createGroupKeyPipeline('sel', 'non-existent name', 0, 0);
      const wanted = [{ $addFields: { ___group_key_0: '$sel' } }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.equal(result.groupIndex, 0);
    });
  });

  suite('createGroupStagePipeline', function() {
    test('basics', function() {
      const groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      const result = createGroupStagePipeline(
        false,
        true,
        null,
        groupKeyPipeline
      );
      const wanted = ['test', { $group: { _id: '$___group_key_99' } }];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });

    test('not countingSeparately', function() {
      const groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      const result = createGroupStagePipeline(
        false,
        false,
        null,
        groupKeyPipeline
      );
      const wanted = [
        'test',
        { $group: { _id: '$___group_key_99', count: { $sum: 1 } } }
      ];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });

    test('not countingSeparately, includeDataItems', function() {
      const groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      const result = createGroupStagePipeline(
        true,
        false,
        'itemProjection',
        groupKeyPipeline
      );
      const wanted = [
        'test',
        {
          $group: {
            _id: '$___group_key_99',
            count: { $sum: 1 },
            items: { $push: 'itemProjection' }
          }
        }
      ];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });
  });

  suite('createGroupingPipeline', function() {
    test('basics', function() {
      const groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      const result = createGroupingPipeline(
        true,
        false,
        true,
        groupKeyPipeline
      );
      const wanted = [
        'test',
        { $group: { _id: '$___group_key_99' } },
        { $project: { _id: 0, key: '$_id' } },
        { $sort: { key: -1 } },
        { $addFields: { items: null } }
      ];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });

    test('not countingSeparately', function() {
      const groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      const result = createGroupingPipeline(
        true,
        false,
        false,
        groupKeyPipeline
      );
      const wanted = [
        'test',
        { $group: { _id: '$___group_key_99', count: { $sum: 1 } } },
        { $project: { _id: 0, key: '$_id', count: 1 } },
        { $sort: { key: -1 } },
        { $addFields: { items: null } }
      ];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });

    test('not countingSeparately, includeDataItems', function() {
      const groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      const result = createGroupingPipeline(
        true,
        true,
        false,
        groupKeyPipeline
      );
      const wanted = [
        'test',
        {
          $group: {
            _id: '$___group_key_99',
            count: { $sum: 1 },
            items: { $push: '$$CURRENT' }
          }
        },
        { $project: { _id: 0, key: '$_id', count: 1, items: 1 } },
        { $sort: { key: -1 } }
      ];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });

    test('not countingSeparately, includeDataItems, custom itemProjection', function() {
      const groupKeyPipeline = ['test'];
      groupKeyPipeline.groupIndex = 99;
      const result = createGroupingPipeline(
        true,
        true,
        false,
        groupKeyPipeline,
        '$$customProjection$$'
      );
      const wanted = [
        'test',
        {
          $group: {
            _id: '$___group_key_99',
            count: { $sum: 1 },
            items: { $push: '$$customProjection$$' }
          }
        },
        { $project: { _id: 0, key: '$_id', count: 1, items: 1 } },
        { $sort: { key: -1 } }
      ];
      assert.equal(JSON.stringify(result), JSON.stringify(wanted));
      assert.isUndefined(result.groupIndex);
    });
  });

  suite('createSkipTakePipeline', function() {
    test('no skip or take', function() {
      assert.deepEqual(createSkipTakePipeline(), []);
    });

    test('skip, no take', function() {
      assert.deepEqual(createSkipTakePipeline(33), [{ $skip: 33 }]);
    });

    test('no skip, take', function() {
      assert.deepEqual(createSkipTakePipeline(null, 33), [{ $limit: 33 }]);
    });

    test('skip and take', function() {
      assert.deepEqual(createSkipTakePipeline(33, 44), [
        { $skip: 33 },
        { $limit: 44 }
      ]);
    });
  });

  suite('createCountPipeline', function() {
    test('works', function() {
      assert.deepEqual(createCountPipeline(), [{ $count: 'count' }]);
    });
  });

  suite('createMatchPipeline', function() {
    test('works', function() {
      assert.deepEqual(createMatchPipeline('sel', 'val'), [
        { $match: { sel: 'val' } }
      ]);
    });
  });

  suite('construct', function() {
    test('works', function() {
      assert.deepEqual(construct('field', 'plus', 'val'), {
        field: { plus: 'val' }
      });
    });
  });

  suite('constructRegex', function() {
    test('works', function() {
      assert.deepEqual(constructRegex('field', 'regex'), {
        field: { $regex: 'regex', $options: '' }
      });
    });
  });

  suite('parseFilter', function() {
    const testParseFilter = (input, expectedMatch, expectedFieldList) => {
      const fieldList = [];
      assert.deepEqual(parseFilter(input, fieldList), expectedMatch);
      assert.deepEqual(fieldList, expectedFieldList);
    };

    test('string element', function() {
      testParseFilter(
        'thing',
        {
          thing: { $eq: true }
        },
        ['thing']
      );
    });

    test('nested array', function() {
      testParseFilter(
        [[['!', 'thing']]], // wild and pointless nesting
        {
          $nor: [
            {
              thing: { $eq: true }
            }
          ]
        },
        ['thing']
      );
    });

    test('!', function() {
      testParseFilter(
        ['!', 'thing'],
        {
          $nor: [
            {
              thing: { $eq: true }
            }
          ]
        },
        ['thing']
      );
    });

    test('unknown unary', function() {
      testParseFilter(['&', 'thing'], null, []);
    });

    test('equal', function() {
      testParseFilter(
        ['thing', '=', 'val'],
        {
          thing: { $eq: 'val' }
        },
        ['thing']
      );
    });

    test('not equal', function() {
      testParseFilter(
        ['thing', '<>', 'val'],
        {
          thing: { $ne: 'val' }
        },
        ['thing']
      );
    });

    test('greater than', function() {
      testParseFilter(
        ['thing', '>', 'val'],
        {
          thing: { $gt: 'val' }
        },
        ['thing']
      );
    });

    test('greater than or equal', function() {
      testParseFilter(
        ['thing', '>=', 'val'],
        {
          thing: { $gte: 'val' }
        },
        ['thing']
      );
    });

    test('lower than', function() {
      testParseFilter(
        ['thing', '<', 'val'],
        {
          thing: { $lt: 'val' }
        },
        ['thing']
      );
    });

    test('lower than or equal', function() {
      testParseFilter(
        ['thing', '<=', 'val'],
        {
          thing: { $lte: 'val' }
        },
        ['thing']
      );
    });

    test('startswith', function() {
      testParseFilter(
        ['thing', 'startswith', 'val'],
        {
          thing: { $regex: '^val', $options: '' }
        },
        ['thing']
      );
    });

    test('endswith', function() {
      testParseFilter(
        ['thing', 'endswith', 'val'],
        {
          thing: { $regex: 'val$', $options: '' }
        },
        ['thing']
      );
    });

    test('contains', function() {
      testParseFilter(
        ['thing', 'contains', 'val'],
        {
          thing: { $regex: 'val', $options: '' }
        },
        ['thing']
      );
    });

    test('notcontains', function() {
      testParseFilter(
        ['thing', 'notcontains', 'val'],
        {
          thing: { $regex: '^((?!val).)*$', $options: '' }
        },
        ['thing']
      );
    });

    test('unknown operator', function() {
      testParseFilter(['thing', '&%&%&%&', 'val'], null, ['thing']);
    });

    test('even number of elements > 2', function() {
      testParseFilter([1, 3, 4, 6], null, []);
    });

    test('not an array or a string', function() {
      testParseFilter({ barg: 42 }, null, []);
    });

    test('odd number of elements > 3 without operator in pos 1', function() {
      testParseFilter([1, 'unknown item', 3, 4, 5], null, []);
    });

    test('odd number of elements > 3 with non-string in pos 1', function() {
      testParseFilter([1, { barg: 42 }, 3, 4, 5], null, []);
    });

    test('nested field', function() {
      testParseFilter(
        ['thing.year', '=', 'val'],
        {
          ___thing_year: { $eq: 'val' }
        },
        ['thing.year']
      );
    });

    test('unrecognized nested field', function() {
      testParseFilter(
        ['thing.unknown', '=', 'val'],
        {
          'thing.unknown': { $eq: 'val' }
        },
        ['thing.unknown']
      );
    });

    test('correct "and" chain', function() {
      testParseFilter(
        [
          ['field1', '=', 42],
          'and',
          ['field2', '>', 10],
          'and',
          ['field3', '<>', 'this thing']
        ],
        {
          $and: [
            {
              field1: { $eq: 42 }
            },
            {
              field2: { $gt: 10 }
            },
            {
              field3: { $ne: 'this thing' }
            }
          ]
        },
        ['field1', 'field2', 'field3']
      );
    });

    test('correct "or" chain', function() {
      testParseFilter(
        [
          ['field1', '=', 42],
          'or',
          ['field2', '>', 10],
          'or',
          ['field3', '<>', 'this thing']
        ],
        {
          $or: [
            {
              field1: { $eq: 42 }
            },
            {
              field2: { $gt: 10 }
            },
            {
              field3: { $ne: 'this thing' }
            }
          ]
        },
        ['field1', 'field2', 'field3']
      );
    });

    test('incorrect operator chain', function() {
      testParseFilter(
        [
          ['field1', '=', 42],
          'and',
          ['field2', '>', 10],
          'or',
          ['field3', '<>', 'this thing']
        ],
        null,
        []
      );
    });

    test('correct combined operator chain', function() {
      testParseFilter(
        [
          ['field1', '=', 42],
          'and',
          [['field2', '>', 10], 'or', ['field3', '<>', 'this thing']]
        ],
        {
          $and: [
            {
              field1: { $eq: 42 }
            },
            {
              $or: [
                {
                  field2: { $gt: 10 }
                },
                {
                  field3: { $ne: 'this thing' }
                }
              ]
            }
          ]
        },
        ['field1', 'field2', 'field3']
      );
    });
  });
});