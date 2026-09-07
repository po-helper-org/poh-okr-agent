export * from './model.js'
export { loadConfig, describeConfig, REQUIRED_BACKLOG_VERSION, type Env, type OkrConfig } from './config.js'
export {
  parseTaskList,
  parseTaskView,
  toSummary,
  BacklogSchemaError,
  SUPPORTED_SCHEMA,
  type RawComment,
  type RawTask,
  type RawTaskDetail,
} from './backlog-json.js'
export { emptyPlan, formatPlan, parsePlan, type PlanBlock, type StageRow } from './plan-block.js'
export { decodeEvent, encodeEvent, eventTypes, sortEvents, type OkrEvent } from './event-note.js'
export { groupOf, groupTasks, isoDay, type Group, type GroupKey } from './po-groups.js'
export { parseCreatedId } from './parse-created.js'
export { parseMilestoneList, type MilestoneRow } from './parse-milestones.js'
export {
  decodeBoardSettings,
  docBody,
  encodeBoardSettings,
  parseDocList,
  type BoardSettings,
} from './board-doc.js'
export {
  kindFromLabels,
  krIdsFromLabels,
  labelForPhase,
  phaseLabelsOf,
  phasesFromLabels,
  readKindLabel,
  readPhaseLabel,
} from './phases.js'
export * as writer from './writer.js'
export { BacklogReader, type BacklogPorts } from './reader.js'
export { runCommandWithNode, runCommandWithTimeout, type CommandResult, type RunCommand } from './ports.js'
export {
  OkrError,
  BacklogFailedError,
  BacklogTimeoutError,
  BacklogTooOldError,
  BacklogUnavailableError,
  InvalidMilestoneIdError,
  InvalidTaskIdError,
  SprintOutOfRangeError,
  TaskNotFoundError,
} from './errors.js'
export { OKR_CHANNEL, dispatch, type RpcResult } from './channel.js'
export { Config, toOkrConfig, type PluginConfig } from './plugin-config.js'

// Харнесс грузит плагин по имени пакета, то есть через эту точку входа:
// без `apply` и `name` здесь композиция его просто не найдёт.
// `Config` уже отдан выше из plugin-config.js — второй раз не реэкспортируем.
export { name, apply } from './plugin.js'
