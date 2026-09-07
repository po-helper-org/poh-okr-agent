/**
 * Блочный редактор описания задачи.
 *
 * Устроен императивно: React монтирует пустой контейнер и больше в него не заглядывает, а
 * блоки создаёт и правит этот модуль напрямую. Иначе каждый набранный символ вызывал бы
 * перерисовку `contenteditable`, React заменял бы узлы — и каретка на каждом нажатии
 * прыгала бы в начало. Это классическая поломка редакторов на React, и обойти её можно
 * только отдав DOM редактору целиком.
 *
 * Наружу редактор отдаёт markdown и из markdown же собирается: описание в Backlog.md читают
 * человек, навыки и CLI (см. `markdown-blocks.ts`).
 */
import { useEffect, useRef } from 'react'
import {
  CONTINUING,
  formatBlocks,
  parseBlocks,
  shortcutFor,
  type Block,
  type BlockType,
} from '../markdown-blocks.js'
import { classNames as css } from './styles.js'

export interface BlockEditorProps {
  /** Текст в markdown. Меняется только при смене задачи — не на каждое нажатие. */
  value: string
  placeholder: string
  /** Открыть меню блоков: редактор сам его не рисует, чтобы не дублировать слой панели. */
  onCommand: (anchor: HTMLElement, apply: (type: BlockType) => void) => void
  onChange: (markdown: string) => void
}

/** Собирает узел блока. Для `todo` это флажок и отдельно редактируемый текст. */
function blockNode(block: Block, placeholder: string): HTMLElement {
  const node = document.createElement('div')
  node.setAttribute('data-block', block.type)

  if (block.type === 'divider') {
    // Линию не редактируют: курсору внутри неё делать нечего.
    node.setAttribute('contenteditable', 'false')
    return node
  }

  if (block.type === 'todo') {
    if (block.done) node.setAttribute('data-done', '')
    const box = document.createElement('button')
    box.type = 'button'
    box.className = css.todoBox
    box.setAttribute('contenteditable', 'false')
    if (block.done) box.setAttribute('data-on', '')
    box.addEventListener('click', () => {
      const on = !node.hasAttribute('data-done')
      node.toggleAttribute('data-done', on)
      box.toggleAttribute('data-on', on)
      node.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const text = document.createElement('span')
    text.className = css.todoText
    text.setAttribute('contenteditable', 'true')
    text.textContent = block.text
    node.append(box, text)
    return node
  }

  node.setAttribute('data-placeholder', placeholder)
  node.textContent = block.text
  return node
}

function blockText(node: Element): string {
  return node.getAttribute('data-block') === 'todo'
    ? (node.querySelector(`.${css.todoText}`)?.textContent ?? '')
    : (node.textContent ?? '')
}

function readBlocks(root: HTMLElement): Block[] {
  return [...root.children].map(node => ({
    type: (node.getAttribute('data-block') ?? 'text') as BlockType,
    text: blockText(node),
    done: node.hasAttribute('data-done'),
  }))
}

/** Блок, внутри которого стоит курсор. */
function currentBlock(root: HTMLElement): HTMLElement | null {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0) return null
  let node: Node | null = selection.getRangeAt(0).startContainer
  while (node !== null && node.parentElement !== null && node.parentElement !== root) {
    node = node.parentElement
  }
  return node !== null && node.parentElement === root ? (node as HTMLElement) : null
}

function focusBlock(node: HTMLElement): void {
  const target = node.getAttribute('data-block') === 'todo'
    ? node.querySelector(`.${css.todoText}`)
    : node
  if (target === null) return
  const range = document.createRange()
  range.selectNodeContents(target)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Пустое описание помечается, чтобы подсказка показалась ровно один раз. */
function markEmpty(root: HTMLElement): void {
  const only = root.children.length === 1 ? root.children[0] : null
  const empty = only !== null
    && only.getAttribute('data-block') === 'text'
    && blockText(only).trim() === ''
  root.toggleAttribute('data-empty', empty)
}

export function BlockEditor({ value, placeholder, onCommand, onChange }: BlockEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Обработчики читают свежие пропсы через ref: сам редактор пересобирается только при
  // смене задачи, и замыкание первого рендера иначе застряло бы навсегда.
  const handlers = useRef({ onCommand, onChange })
  handlers.current = { onCommand, onChange }

  useEffect(() => {
    const root = hostRef.current
    if (root === null) return

    root.replaceChildren(...parseBlocks(value).map(block => blockNode(block, placeholder)))
    markEmpty(root)

    const setType = (node: HTMLElement, type: BlockType): void => {
      const replacement = blockNode(
        { type, text: type === 'divider' ? '' : blockText(node), done: false },
        placeholder,
      )
      node.replaceWith(replacement)
      if (type === 'divider') {
        // После линии нужна строка, в которой можно продолжить писать.
        const after = blockNode({ type: 'text', text: '', done: false }, placeholder)
        replacement.after(after)
        focusBlock(after)
      } else {
        focusBlock(replacement)
      }
      markEmpty(root)
      handlers.current.onChange(formatBlocks(readBlocks(root)))
    }

    const onInput = (): void => {
      markEmpty(root)
      const node = currentBlock(root)
      if (node !== null) {
        const text = blockText(node)
        // «/» в начале пустой строки открывает меню блоков. В середине текста косая черта
        // остаётся обычным знаком: пути и дроби пишут чаще, чем зовут меню.
        if (text === '/') {
          handlers.current.onCommand(node, type => {
            node.textContent = ''
            setType(node, type)
          })
        } else if (/^-{3,}$/.test(text.trim()) && node.getAttribute('data-block') === 'text') {
          // «---» превращается в линию сразу, без Enter — как в привычных markdown-редакторах.
          setType(node, 'divider')
          return
        } else if (node.getAttribute('data-block') === 'text') {
          // Набранная руками разметка превращается в блок: «- », «[] », «# » и прочие.
          // Иначе чеклист можно получить только через меню, а человек набирает его привычно.
          const shortcut = shortcutFor(text)
          if (shortcut !== null) {
            node.textContent = shortcut.rest
            setType(node, shortcut.type)
            return
          }
        }
      }
      handlers.current.onChange(formatBlocks(readBlocks(root)))
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      const node = currentBlock(root)
      if (node === null) return
      const type = (node.getAttribute('data-block') ?? 'text') as BlockType

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        // Пустой пункт списка по Enter выходит из списка, а не плодит пустые пункты.
        if (CONTINUING.has(type) && blockText(node).trim() === '') {
          setType(node, 'text')
          return
        }
        const created = blockNode(
          { type: CONTINUING.has(type) ? type : 'text', text: '', done: false },
          placeholder,
        )
        node.after(created)
        focusBlock(created)
        markEmpty(root)
        handlers.current.onChange(formatBlocks(readBlocks(root)))
        return
      }

      if (event.key === 'Backspace' && blockText(node).trim() === '') {
        if (type !== 'text') {
          // Первый Backspace возвращает блок в обычный текст, второй удаляет строку.
          event.preventDefault()
          setType(node, 'text')
          return
        }
        const previous = node.previousElementSibling
        if (previous !== null) {
          event.preventDefault()
          node.remove()
          focusBlock(previous as HTMLElement)
          markEmpty(root)
          handlers.current.onChange(formatBlocks(readBlocks(root)))
        }
      }
    }

    root.addEventListener('input', onInput)
    root.addEventListener('keydown', onKeyDown)
    return () => {
      root.removeEventListener('input', onInput)
      root.removeEventListener('keydown', onKeyDown)
    }
    // `value` здесь — начальное содержимое: пересборка на каждую букву сбрасывала бы курсор.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, placeholder])

  return <div ref={hostRef} className={css.editor} contentEditable suppressContentEditableWarning spellCheck={false} />
}
