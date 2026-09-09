/**
 * Поиск ключевого результата по названию.
 *
 * Меню привязки вываливало весь список целей — на живом воркспейсе это сорок с лишним
 * строк, и найти нужную глазами дольше, чем набрать три буквы. Поэтому список закрыт,
 * пока не набран запрос, а сюда вынесен сам подбор: он чистый и проверяется без браузера.
 *
 * Поиск локальный и без словарей: в панели он должен работать на отключённом от сети
 * ноутбуке и на русских названиях, где обычное `includes` спотыкается о регистр, «ё»
 * и о случайно не переключённую раскладку.
 */

/** Минимум, с которого имеет смысл искать: на двух буквах совпадёт половина доски. */
export const MIN_QUERY = 3

/** Сколько строк показываем. Больше — это снова список, который просили убрать. */
export const MAX_RESULTS = 5

export interface Searchable {
  id: string
  title: string
}

/** Раскладки для случая «набрал русское слово латиницей и наоборот». */
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`"
const RU = 'йцукенгшщзхъфывапролджэячсмитьбю ё'

const TO_RU = new Map<string, string>()
const TO_EN = new Map<string, string>()
for (let i = 0; i < EN.length; i += 1) {
  TO_RU.set(EN[i], RU[i])
  TO_EN.set(RU[i], EN[i])
}

/**
 * Приводит строку к виду, в котором её сравнивают.
 *
 * «Ё» сводится к «е» намеренно: в названиях целей она пишется как придётся, и поиск по
 * «переезд» не должен терять «перeёзд».
 */
export function normalize(value: string): string {
  return value.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim()
}

/** Та же строка, набранная в другой раскладке. Незнакомые символы остаются как есть. */
export function swapLayout(value: string): string {
  let out = ''
  for (const char of value) out += TO_RU.get(char) ?? TO_EN.get(char) ?? char
  return out
}

/** Все символы запроса встречаются в строке по порядку. Возвращает разрыв или -1. */
function subsequenceGap(haystack: string, needle: string): number {
  let index = 0
  let first = -1
  let last = -1
  for (const char of needle) {
    const found = haystack.indexOf(char, index)
    if (found === -1) return -1
    if (first === -1) first = found
    last = found
    index = found + 1
  }
  return last - first
}

/**
 * Оценка совпадения. Больше — раньше в списке, 0 — не совпало.
 *
 * Порядок правил — от точного к догадке: идентификатор, начало названия, вхождение,
 * начало слова, и только потом подпоследовательность. Иначе «ТС» из середины длинного
 * названия обгоняло бы цель, которая с «ТС» начинается.
 */
export function score(item: Searchable, query: string): number {
  const title = normalize(item.title)
  const id = normalize(item.id)
  if (query === '') return 0
  if (id === query) return 1200
  if (id.startsWith(query)) return 1000
  if (title.startsWith(query)) return 900
  const at = title.indexOf(query)
  if (at !== -1) return 800 - Math.min(at, 99)

  const words = title.split(/[^\p{L}\p{N}]+/u).filter(word => word !== '')
  const tokens = query.split(/\s+/).filter(token => token !== '')
  if (tokens.length > 0 && tokens.every(token => words.some(word => word.startsWith(token)))) {
    return 700
  }

  const gap = subsequenceGap(title, query.replace(/\s+/g, ''))
  if (gap !== -1) return Math.max(100, 500 - gap)
  return 0
}

/**
 * Подбирает цели под запрос.
 *
 * Пустой результат для короткого запроса — часть договорённости с интерфейсом: пока
 * запрос короче `MIN_QUERY`, меню не показывает ничего.
 */
export function searchKeyResults<T extends Searchable>(
  items: readonly T[],
  query: string,
  limit: number = MAX_RESULTS,
): T[] {
  const direct = normalize(query)
  if (direct.length < MIN_QUERY) return []
  // Вторая попытка — та же строка в другой раскладке. Берём лучшую из двух оценок:
  // «rbyj» и «кино» должны находить одно и то же.
  const swapped = normalize(swapLayout(direct))

  const ranked: Array<{ item: T; rank: number }> = []
  for (const item of items) {
    const rank = Math.max(score(item, direct), swapped === direct ? 0 : score(item, swapped))
    if (rank > 0) ranked.push({ item, rank })
  }

  ranked.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank
    // При равном совпадении короче — точнее: длинное название совпало «заодно».
    if (a.item.title.length !== b.item.title.length) return a.item.title.length - b.item.title.length
    return a.item.id.localeCompare(b.item.id, 'ru')
  })
  return ranked.slice(0, limit).map(entry => entry.item)
}
