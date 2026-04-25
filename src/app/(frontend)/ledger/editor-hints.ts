import { StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'

class HintsWidget extends WidgetType {
  toDOM(): HTMLElement {
    const root = document.createElement('div')
    root.className = 'cm-editor-hints'
    root.innerHTML = [
      '<kbd>⌘S</kbd> save',
      '<kbd>⌘I</kbd> edit with AI',
      '<kbd>/</kbd> slash commands',
      '<kbd>:</kbd> account autocomplete',
    ].join('<span class="cm-editor-hints__sep">·</span>')
    return root
  }
  eq(other: WidgetType): boolean {
    return other instanceof HintsWidget
  }
  ignoreEvent(): boolean {
    return false
  }
}

const hintsDeco = Decoration.widget({ widget: new HintsWidget(), block: true, side: -1 })

export const editorHints = StateField.define<DecorationSet>({
  create: () => Decoration.set([hintsDeco.range(0)]),
  update: (value) => value,
  provide: (f) => EditorView.decorations.from(f),
})
