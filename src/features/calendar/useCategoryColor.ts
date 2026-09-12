import { useStore } from '../../data/store'
import { UNCATEGORIZED_COLOR } from '../../lib/colors'

/** Colour of an event's category, falling back to the uncategorised colour. */
export function useCategoryColor(categoryId: string | null): string {
  const cat = useStore((s) => (categoryId ? s.categories.find((c) => c.id === categoryId) : undefined))
  return cat?.color ?? UNCATEGORIZED_COLOR
}
