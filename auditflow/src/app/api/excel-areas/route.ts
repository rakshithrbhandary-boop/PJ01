import ExcelJS from 'exceljs'

export async function POST(request: Request) {
  const { areas, executives, assignmentTitle } = await request.json() as {
    areas: Array<{
      id: string; title: string; assigneeName: string; status: string; priority: string; due_date: string;
      subAreas: Array<{ id: string; title: string; assigneeName: string; status: string; priority: string; due_date: string }>
    }>
    executives: Array<{ id: string; full_name: string }>
    assignmentTitle: string
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'AuditFlow'

  // Hidden lookup sheet for dropdown values
  const wsLookup = wb.addWorksheet('_lookup', { state: 'veryHidden' })
  const execNames = executives.map(e => e.full_name)
  execNames.forEach((n, i) => { wsLookup.getCell(i + 1, 1).value = n })
  wsLookup.getCell(1, 2).value = 'low'
  wsLookup.getCell(2, 2).value = 'medium'
  wsLookup.getCell(3, 2).value = 'high'

  // Main sheet
  const ws = wb.addWorksheet('Areas')

  ws.columns = [
    { header: 'Area', key: 'area', width: 30 },
    { header: 'Sub-Area', key: 'subarea', width: 30 },
    { header: 'Assigned To Executive', key: 'assignee', width: 25 },
    { header: 'Priority', key: 'priority', width: 12 },
    { header: 'Due Date (YYYY-MM-DD)', key: 'due_date', width: 22 },
    { header: 'ID', key: 'id', width: 38 },
  ]

  // Style header row
  const headerRow = ws.getRow(1)
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  headerRow.height = 20

  let rowIndex = 2
  for (const area of areas) {
    // Area row
    const aRow = ws.addRow({
      area: area.title,
      subarea: '',
      assignee: area.assigneeName,
      priority: area.priority,
      due_date: area.due_date,
      id: area.id,
    })
    aRow.getCell('area').font = { bold: true }
    aRow.getCell('area').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EFFE' } }
    aRow.eachCell(c => { c.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } } })
    rowIndex++

    // Sub-area rows
    for (const sub of area.subAreas ?? []) {
      const sRow = ws.addRow({
        area: area.title,
        subarea: sub.title,
        assignee: sub.assigneeName,
        priority: sub.priority,
        due_date: sub.due_date,
        id: sub.id,
      })
      sRow.getCell('area').font = { color: { argb: 'FF6B7280' } }
      sRow.getCell('subarea').font = { bold: false }
      sRow.eachCell(c => { c.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } } })
      rowIndex++
    }
  }

  const lastRow = rowIndex - 1

  // Dropdown: Assigned To Executive (column C)
  const execFormula = execNames.length > 0
    ? `_lookup!$A$1:$A$${execNames.length}`
    : `"${execNames.join(',')}"`

  for (let r = 2; r <= Math.max(lastRow, 2); r++) {
    ws.getCell(r, 3).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [execFormula],
      showErrorMessage: true,
      errorTitle: 'Invalid Executive',
      error: 'Please select from the dropdown list',
    }
    ws.getCell(r, 4).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"low,medium,high"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Priority',
      error: 'Please select: low, medium, or high',
    }
  }

  // Hide ID column
  ws.getColumn(6).hidden = true

  // Freeze header row
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await wb.xlsx.writeBuffer()

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${assignmentTitle}-areas.xlsx"`,
    },
  })
}
