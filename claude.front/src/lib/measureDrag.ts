/** Собственный тип отличает перенос меры от ссылок, файлов и выделенного текста. */
export const MEASURE_DRAG_TYPE = 'application/x-akim-measure'
const PREFIX = 'akim-measure:'

export function writeMeasureDrag(transfer: Pick<DataTransfer, 'setData' | 'effectAllowed'>, measureId: string) {
  transfer.setData(MEASURE_DRAG_TYPE, measureId)
  transfer.setData('text/plain', `${PREFIX}${measureId}`)
  transfer.effectAllowed = 'copy'
}

export function readMeasureDrag(transfer: Pick<DataTransfer, 'getData'>): string | null {
  const custom = transfer.getData(MEASURE_DRAG_TYPE)
  const text = transfer.getData('text/plain')
  const id = custom || (text.startsWith(PREFIX) ? text.slice(PREFIX.length) : '')
  return /^M\d+$/.test(id) ? id : null
}
