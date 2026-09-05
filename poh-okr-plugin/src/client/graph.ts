/**
 * Раскладка графа детальной страницы.
 *
 * Чистая функция: на вход — сколько узлов и какого размера область, на выход — координаты.
 * Так требование «граф не допускает наложения узлов при полном наборе данных» проверяется
 * тестом на числах, а не глазами по скриншоту с одним частным набором данных.
 *
 * Узлы раскладываются по кольцам вокруг центра. Кольцо вмещает столько узлов, сколько
 * помещается без пересечения хорд: чем больше узлов, тем больше нужен радиус. Когда радиус
 * упирается в границы области, заводится следующее кольцо внутрь — расширять первое дальше
 * некуда, а сжимать промежутки нельзя, иначе подписи наедут друг на друга.
 */

export interface Point {
  x: number
  y: number
}

export interface GraphLayoutOptions {
  /** Размеры области отрисовки в пикселях. */
  width: number
  height: number
  /** Габарит узла: минимальное расстояние между центрами соседей по кольцу. */
  nodeSize?: number
  /** Отступ от края области, чтобы узел не срезался границей. */
  margin?: number
}

const DEFAULT_NODE_SIZE = 148
const DEFAULT_MARGIN = 84

/** Сколько узлов помещается на кольце радиуса `radius` без сближения теснее `nodeSize`. */
function capacity(radius: number, nodeSize: number): number {
  if (radius <= 0) return 1
  // Хорда между соседями: 2·r·sin(π/n) ≥ nodeSize.
  const ratio = nodeSize / (2 * radius)
  if (ratio >= 1) return 1
  return Math.max(1, Math.floor(Math.PI / Math.asin(ratio)))
}

/**
 * Координаты узлов вокруг центра области.
 *
 * Первый узел ставится сверху и дальше по часовой стрелке: порядок узлов на экране совпадает
 * с порядком в данных, поэтому одна и та же сущность у одного и того же KR всегда оказывается
 * на одном месте, а не прыгает при перерисовке.
 */
export function layoutAround(count: number, options: GraphLayoutOptions): Point[] {
  const nodeSize = options.nodeSize ?? DEFAULT_NODE_SIZE
  const margin = options.margin ?? DEFAULT_MARGIN
  const cx = options.width / 2
  const cy = options.height / 2

  const outerX = Math.max(nodeSize / 2, cx - margin)
  const outerY = Math.max(nodeSize / 2, cy - margin)

  const points: Point[] = []
  let placed = 0
  let ring = 0

  while (placed < count) {
    // Каждое следующее кольцо ближе к центру ровно на габарит узла: иначе кольца наложились бы
    // друг на друга так же, как соседи внутри одного кольца.
    const shrink = ring * nodeSize
    const rx = Math.max(nodeSize / 2, outerX - shrink)
    const ry = Math.max(nodeSize / 2, outerY - shrink)
    const remaining = count - placed

    // Вместимость считается по меньшей полуоси: на вытянутой области именно она определяет,
    // где узлы сойдутся теснее всего.
    const fits = Math.min(capacity(Math.min(rx, ry), nodeSize), remaining)
    // Кольцо, где помещается один узел, дальше сжимать бессмысленно — раскладываем остаток
    // здесь же, иначе цикл ушёл бы в бесконечность на крошечной области.
    const take = rx <= nodeSize / 2 && ry <= nodeSize / 2 ? remaining : fits

    for (let i = 0; i < take; i += 1) {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / take
      points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
    }

    placed += take
    ring += 1
  }

  return points
}

/** Минимальное расстояние между парами точек — то, что проверяет тест на наложение. */
export function minimumDistance(points: readonly Point[]): number {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = points[i].x - points[j].x
      const dy = points[i].y - points[j].y
      min = Math.min(min, Math.hypot(dx, dy))
    }
  }
  return points.length < 2 ? Number.POSITIVE_INFINITY : min
}
