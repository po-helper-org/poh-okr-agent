/**
 * Словарь раздела.
 *
 * Рабочий язык этого развёртывания — русский, поэтому оба обязательных слота харнесса
 * получают один и тот же словарь: подписи остаются русскими независимо от того, какой из
 * встроенных языков сейчас активен. `en` держится источником истины для набора ключей.
 */
export const ru = {
  nav: 'Управление целями',
  panelTitle: 'Панель работы',

  tabTasks: 'Задачи',
  tabControl: 'Договорённости',
  tabRisks: 'Риски',

  addTask: 'Добавить задачу',
  // Названия по умолчанию для только что заведённых записей. Отдельно от подписей
  // кнопок: подпись кнопки в качестве названия задачи читается как ошибка.
  newTask: 'Новая задача',
  newKr: 'Новый ключевой результат',
  openBoard: 'Открыть доску целей',
  close: 'Закрыть',
  back: 'Назад',
  retry: 'Повторить',
  refresh: 'Обновить',
  delete: 'Удалить',

  due: 'до',
  groupOverdue: 'Просрочено',
  groupToday: 'Сегодня',
  groupWeek: 'На неделе',
  groupLater: 'Позже',
  groupDone: 'Выполнено',
  groupNoDate: 'Без срока',

  loading: 'Загружаю…',
  emptyTasks: 'Задач нет',
  emptyTasksHint: 'Кнопка «+» заводит первую',
  emptyBoard: 'Доска пуста',
  emptyBoardHint: 'Заведите объектив, внутри него — ключевые результаты',
  errorTitle: 'Не удалось получить данные',

  boardTitle: 'Доска целей',
  addObjective: 'Добавить объектив',
  addKr: 'Добавить ключевой результат',
  knowledgeBase: 'База знаний',
  untitledObjective: 'Без названия',
  noObjective: 'Без объектива',

  tabDescription: 'Описание',
  tabLinks: 'Ссылки',
  tabPlanning: 'Планирование',

  fieldDescription: 'Описание инициативы',
  fieldDone: 'Что уже сделано',
  fieldTodo: 'Что осталось сделать',
  fieldRisks: 'Риски',
  fieldConfluence: 'Confluence (БФТ)',
  fieldJira: 'Эпик трекера',
  fieldTeams: 'Команды исполнения',
  fieldTechLeads: 'Ответственные техлиды',
  fieldExecutors: 'Ответственные исполнители',
  fieldSprint: 'Плановый спринт',
  fieldResources: 'Плановые ресурсы',
  fieldDue: 'Срок',
  fieldNoSprint: 'не выбран',

  detailPage: 'Детальная страница',
  continueInChat: 'Продолжить в чате',
  addEvent: 'Добавить событие',
  eventDate: 'Дата',
  eventType: 'Тип',
  eventTitle: 'Заголовок',
  eventNote: 'Заметка',
  emptyEvents: 'Событий нет',

  blockText: 'Текст',
  blockH1: 'Заголовок 1',
  blockH2: 'Заголовок 2',
  blockH3: 'Заголовок 3',
  blockBulleted: 'Маркированный список',
  blockNumbered: 'Нумерованный список',
  blockCheck: 'Пункт с галочкой',
  blockQuote: 'Цитата',
  blockDivider: 'Разделитель',

  taskContext: 'Контекст по задаче…',
  taskSource: 'Источник',
} as const

export type OkrLocaleKey = keyof typeof ru

export const en: Record<OkrLocaleKey, string> = ru
