import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as writer from '../src/writer.js'
import { InvalidMilestoneIdError, InvalidTaskIdError, SprintOutOfRangeError } from '../src/errors.js'

test('KR заводится типом и привязкой к объективу', () => {
  assert.deepEqual(
    writer.createKeyResult({ title: 'Доля отказов ниже 2%', objectiveId: 'm-1', taskType: 'okr' }),
    ['task', 'create', 'Доля отказов ниже 2%', '--type', 'okr', '--milestone', 'm-1'],
  )
})

test('операционная задача связывается с KR зависимостью, а не родительством', () => {
  // Подзадача получила бы идентификатор PO-20.1 и въехала в иерархию KR — у операционной
  // задачи свой жизненный цикл, она не часть ключевого результата.
  const args = writer.createPoTask({ title: 'Созвон с Кузнецовым', kind: 'control', taskType: 'potask', relatedKrId: 'PO-20' })
  assert.ok(args.includes('--dep'))
  assert.ok(!args.includes('-p'))
  assert.deepEqual(args.slice(-2), ['--dep', 'PO-20'])
})

test('у создания задачи флаг меток называется --labels', () => {
  // У `task create` он `--labels`, у `task edit` — `--label`. Неизвестный флаг Backlog.md
  // отвергает целиком, поэтому перепутать их нельзя.
  const args = writer.createPoTask({ title: 'Риск срыва интеграции', kind: 'risk', taskType: 'potask' })
  assert.ok(args.includes('--labels'))
  assert.ok(!args.includes('--label'))
})

test('смена фазы снимает старую метку и ставит новую одной командой', () => {
  const args = writer.setPhase('PO-30', ['okr-phase:s2:research', 'okr-kind:task'], 1, 'dev')
  assert.deepEqual(args, [
    'task', 'edit', 'PO-30',
    '--remove-label', 'okr-phase:s2:research',
    '--add-label', 'okr-phase:s2:dev',
  ])
})

test('чужие метки задачи смена фазы не трогает', () => {
  const args = writer.setPhase('PO-30', ['okr-kind:task', 'okr-phase:s1:qa'], 0, 'release')
  assert.ok(!args!.join(' ').includes('okr-kind:task'))
})

test('очистка ячейки только снимает метку', () => {
  const args = writer.setPhase('PO-30', ['okr-phase:s1:qa'], 0, null)
  assert.deepEqual(args, ['task', 'edit', 'PO-30', '--remove-label', 'okr-phase:s1:qa'])
})

test('дубликаты меток одного спринта снимаются целиком', () => {
  // Метки могли править мимо плагина; уцелевший дубликат пережил бы правку и ячейка
  // осталась бы прежней.
  const args = writer.setPhase('PO-30', ['okr-phase:s1:qa', 'okr-phase:s1:dev'], 0, 'release')
  const removed = args![args!.indexOf('--remove-label') + 1]
  assert.deepEqual(removed.split(',').sort(), ['okr-phase:s1:dev', 'okr-phase:s1:qa'])
})

test('ячейка уже в нужной фазе — команды нет', () => {
  assert.equal(writer.setPhase('PO-30', ['okr-phase:s1:dev'], 0, 'dev'), null)
})

test('очистка пустой ячейки — команды нет', () => {
  assert.equal(writer.setPhase('PO-30', ['okr-kind:task'], 0, null), null)
})

test('спринт за пределами доски отвергается до похода в CLI', () => {
  assert.throws(() => writer.setPhase('PO-30', [], 6, 'dev'), SprintOutOfRangeError)
})

test('идентификатор задачи проверяется до похода в CLI', () => {
  // `backlog task edit --help` отвечает кодом 0: без проверки это выглядело бы как успешная
  // правка, которая ничего не изменила.
  assert.throws(() => writer.renameTask('--help', 'что угодно'), InvalidTaskIdError)
})

test('идентификатор объектива проверяется до похода в CLI', () => {
  assert.throws(() => writer.removeObjective('--help'), InvalidMilestoneIdError)
})

test('удаление объектива сохраняет привязку задач', () => {
  // Умолчание Backlog.md — `clear`: оно стирает у KR принадлежность объективу безвозвратно.
  assert.deepEqual(
    writer.removeObjective('m-2'),
    ['milestone', 'remove', 'm-2', '--task-handling', 'keep'],
  )
})

test('связь с KR дублируется меткой ради чтения списком', () => {
  // `task list --json` зависимостей не отдаёт; панель работы читает именно список.
  const args = writer.createPoTask({ title: 'Созвон', kind: 'task', taskType: 'potask', relatedKrId: 'PO-30' })
  assert.ok(args[args.indexOf('--labels') + 1].split(',').includes('okr-kr:PO-30'))
  assert.ok(args.includes('--dep'))
})

test('быстрый ввод передаёт описание и приоритет одной командой', () => {
  const args = writer.createPoTask({
    title: 'Согласовать бюджет', kind: 'task', taskType: 'potask',
    description: 'Контекст из второй строки', priority: 'high',
  })
  assert.deepEqual(args.slice(args.indexOf('--description')), [
    '--description', 'Контекст из второй строки', '--priority', 'high',
  ])
})

test('невыбранный приоритет не подставляется умолчанием', () => {
  // У Backlog.md нет значения «никакой»; подстановка выдала бы догадку за решение человека.
  const args = writer.createPoTask({ title: 'Задача', kind: 'task', taskType: 'potask' })
  assert.ok(!args.includes('--priority'))
})
