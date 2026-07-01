const test = require('node:test');
const assert = require('node:assert/strict');

const { parseRoutineReorderInput, swapExercisePositions } = require('./../dist/utils/parsers.js');

test('parseRoutineReorderInput extracts the day and the exercise list in order', () => {
  const parsed = parseRoutineReorderInput('Lunes Sentadilla 4x12, Prensa 3x10, Remo 3x8');

  assert.deepEqual(parsed, {
    day: 'Lunes',
    exercisesText: 'Sentadilla 4x12, Prensa 3x10, Remo 3x8'
  });
});

test('swapExercisePositions swaps two exercises and preserves the rest', () => {
  const exercises = [
    { order: 1, name: 'Sentadilla', sets: 4, reps: 12 },
    { order: 2, name: 'Prensa', sets: 3, reps: 10 },
    { order: 3, name: 'Remo', sets: 3, reps: 8 }
  ];

  const updated = swapExercisePositions(exercises, 0, 2);

  assert.equal(updated[0].name, 'Remo');
  assert.equal(updated[2].name, 'Sentadilla');
  assert.equal(updated[1].name, 'Prensa');
});
