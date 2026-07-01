const test = require('node:test');
const assert = require('node:assert/strict');

const { parseRoutineReorderInput } = require('./../dist/utils/parsers.js');

test('parseRoutineReorderInput extracts the day and the exercise list in order', () => {
  const parsed = parseRoutineReorderInput('Lunes Sentadilla 4x12, Prensa 3x10, Remo 3x8');

  assert.deepEqual(parsed, {
    day: 'Lunes',
    exercisesText: 'Sentadilla 4x12, Prensa 3x10, Remo 3x8'
  });
});
