import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kindFromLabels, phasesFromLabels, readPhaseLabel } from '../src/phases.js'
import { emptyPhases, phaseLabel } from '../src/model.js'

test('метка фазы разбирается в номер спринта и фазу', () => {
  assert.deepEqual(readPhaseLabel('okr-phase:s3:dev'), { sprint: 2, phase: 'dev' })
})

test('спринт за пределами доски не разбирается', () => {
  assert.equal(readPhaseLabel('okr-phase:s7:dev'), null)
})

test('незнакомая фаза не разбирается', () => {
  assert.equal(readPhaseLabel('okr-phase:s1:deploy'), null)
})

test('чужая метка не принимается за фазу', () => {
  assert.equal(readPhaseLabel('bft-needed'), null)
})

test('раскладка собирается из меток, посторонние игнорируются', () => {
  const phases = phasesFromLabels(['okr-phase:s1:research', 'bft-needed', 'okr-phase:s4:qa'])
  assert.deepEqual(phases, [1, 0, 0, 4, 0, 0])
})

test('без меток раскладка пустая', () => {
  assert.deepEqual(phasesFromLabels([]), emptyPhases())
})

test('две метки на один спринт — показывается более поздняя фаза', () => {
  // Метки могли править мимо плагина. Показать раннюю стадию значило бы откатить доску назад.
  const phases = phasesFromLabels([phaseLabel(0, 'release'), phaseLabel(0, 'research')])
  assert.equal(phases[0], 5)
})

test('вкладка панели берётся из метки', () => {
  assert.equal(kindFromLabels(['okr-kind:risk']), 'risk')
})

test('задача без метки вида попадает на вкладку задач, а не пропадает', () => {
  assert.equal(kindFromLabels(['whatever']), 'task')
})
