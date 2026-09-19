export function stableSort<T>(array: T[], compareFn: (a: T, b: T) => number): T[] {
  return array
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const order = compareFn(a.item, b.item);
      return order !== 0 ? order : a.index - b.index;
    })
    .map(({ item }) => item);
}

export function compareBanNameEmptyLast(a: string, b: string): number {
  if (a === '' && b === '') return 0;
  if (a === '') return 1;
  if (b === '') return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}
