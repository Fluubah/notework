import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AnnotationDomLayer } from './AnnotationDomLayer'
import { useStore } from '../../data/store'
import type { Annotation } from '../../types/models'

const sticky: Annotation = {
  id: 'a1',
  pdfId: 'p1',
  page: 1,
  type: 'sticky',
  color: '#ffe83b',
  x: 40,
  y: 60,
  text: '',
  createdAt: '2026-01-06T09:00:00.000Z',
}

const textBox: Annotation = {
  id: 'a2',
  pdfId: 'p1',
  page: 1,
  type: 'text',
  color: '#111318',
  x: 10,
  y: 20,
  w: 140,
  fontSize: 12,
  text: 'first draft',
  createdAt: '2026-01-06T09:00:00.000Z',
}

function layer(annotations: Annotation[], selectedId: string | null) {
  return (
    <AnnotationDomLayer
      pdfId="p1"
      page={1}
      scale={1}
      annotations={annotations}
      selectedId={selectedId}
      onSelect={() => {}}
      pageSize={{ width: 612, height: 792 }}
      interactive
    />
  )
}

describe('AnnotationDomLayer', () => {
  beforeEach(() => {
    useStore.setState({ annotations: [] })
  })

  it('opens the popover for a sticky note that is selected as it mounts', () => {
    // Dropping a new note selects it on the very first render, before the
    // marker's ref callback has run. The popover still has to appear.
    render(layer([sticky], sticky.id))
    expect(screen.getByPlaceholderText('Write a note…')).toBeInTheDocument()
  })

  it('opens the popover when an existing note is selected later', () => {
    const { rerender } = render(layer([sticky], null))
    expect(screen.queryByPlaceholderText('Write a note…')).not.toBeInTheDocument()

    rerender(layer([sticky], sticky.id))
    expect(screen.getByPlaceholderText('Write a note…')).toBeInTheDocument()
  })

  it('closes the popover when the note is deselected', () => {
    const { rerender } = render(layer([sticky], sticky.id))
    rerender(layer([sticky], null))
    expect(screen.queryByPlaceholderText('Write a note…')).not.toBeInTheDocument()
  })

  it('keeps a text box draft while the stored text is unchanged', () => {
    render(layer([textBox], textBox.id))
    expect(screen.getByRole('textbox')).toHaveValue('first draft')
  })

  it('adopts a text box change that came from elsewhere', () => {
    const { rerender } = render(layer([textBox], textBox.id))
    rerender(layer([{ ...textBox, text: 'edited elsewhere' }], textBox.id))
    expect(screen.getByRole('textbox')).toHaveValue('edited elsewhere')
  })
})
