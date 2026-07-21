import { Plus } from 'lucide-react'

export type LibraryElementType =
  | 'topic'
  | 'statement'
  | 'quote'
  | 'bullets'
  | 'checklist'
  | 'numbered'
  | 'insight'
  | 'table'
  | 'accordion'
  | 'feature'
  | 'gallery'
  | 'code'
  | 'timeline'
  | 'flowchart'

export const libraryElementOptions: Array<{
  type: LibraryElementType
  label: string
}> = [
  { type: 'topic', label: 'Add Topic' },
  { type: 'statement', label: 'Centered Statement' },
  { type: 'quote', label: 'Blue Callout' },
  { type: 'bullets', label: 'Bullet Text' },
  { type: 'checklist', label: 'Checklist Bullets' },
  { type: 'numbered', label: 'Numbered Text' },
  { type: 'insight', label: 'Key Insight' },
  { type: 'table', label: 'Editable Table' },
  { type: 'accordion', label: 'Dropdown' },
  { type: 'feature', label: 'Feature Card' },
  { type: 'gallery', label: 'Image Gallery' },
  { type: 'code', label: 'Blue Text Block' },
  { type: 'timeline', label: 'Roadmap' },
  { type: 'flowchart', label: 'Diagnostic Flow' },
]

type LibraryElementMenuProps = {
  onAddElement: (type: LibraryElementType) => void
}

export function LibraryElementMenu({ onAddElement }: LibraryElementMenuProps) {
  return (
    <div className="max-h-[55vh] w-60 overflow-y-auto rounded-2xl border border-[#dce3ef] bg-white p-2 shadow-[0_18px_45px_rgba(11,28,48,0.16)]">
      {libraryElementOptions.map((option) => (
        <button
          key={option.type}
          onClick={() => onAddElement(option.type)}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.12em] text-[#0040a1] hover:bg-[#eff4ff]"
          type="button"
        >
          <Plus className="size-4" />
          {option.label}
        </button>
      ))}
    </div>
  )
}
