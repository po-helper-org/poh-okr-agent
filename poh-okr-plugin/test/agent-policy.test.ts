import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capturePolicy } from '../src/agent-policy.js'
import type { OkrConfig } from '../src/config.js'

const CONFIG: OkrConfig = {
  workspaceRoot: '/tmp/workspace',
  backlogBin: 'backlog',
  krTaskType: 'okr',
  poTaskType: 'potask',
  boardDocTitle: 'okr-board',
  nexusOkrPath: 'GROUND/NEXUS/okr',
  sessionPath: '',
}

test('правило называет метки, которые читает панель', () => {
  // Разъехаться названию метки в промпте и в коде нельзя: модель завела бы задачи,
  // которых панель не увидит.
  const text = capturePolicy(CONFIG)
  for (const label of ['okr-kind:task', 'okr-kind:control', 'okr-kind:risk']) {
    assert.ok(text.includes(label), `нет метки ${label}`)
  }
})

test('правило зовёт настроенный CLI, тип задач и корень воркспейса', () => {
  const text = capturePolicy({ ...CONFIG, backlogBin: '/opt/backlog', poTaskType: 'po', workspaceRoot: '/srv/po' })
  assert.ok(text.includes('/opt/backlog task create'))
  assert.ok(text.includes('--type po '))
  assert.ok(text.includes('/srv/po'))
})

test('правило запрещает запись мимо Backlog.md и ручную правку файлов задач', () => {
  const text = capturePolicy(CONFIG)
  assert.ok(text.includes('markdown-файлы'))
  assert.ok(text.includes('backlog/tasks/*.md'))
})

test('привязка к KR требует и метку, и зависимость', () => {
  const text = capturePolicy(CONFIG)
  assert.ok(text.includes('okr-kr:<id KR>'))
  assert.ok(text.includes('--dep <id KR>'))
})
