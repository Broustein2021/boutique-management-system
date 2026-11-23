/**
 * Générateur d'exports PDF partagé (jsPDF + jspdf-autotable).
 * Le CSV reste généré dans app/actions.ts : ce module ne produit que le PDF.
 */

export type ExportBlock = {
  title?: string
  columns?: string[]
  rows: Array<Array<string | number>>
  totals?: Array<{ label: string; value: string | number }>
}

export type ExportTable = {
  title: string
  subtitle?: string
  blocks: ExportBlock[]
}

type JsPdfWithAutoTable = {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } }
  lastAutoTable?: { finalY: number }
  setFont: (font: string, style?: string) => void
  setFontSize: (size: number) => void
  setTextColor: (r: number, g: number, b: number) => void
  setDrawColor: (r: number, g: number, b: number) => void
  setLineWidth: (width: number) => void
  line: (x1: number, y1: number, x2: number, y2: number) => void
  text: (text: string, x: number, y: number, options?: { align?: 'left' | 'center' | 'right' }) => void
  addPage: () => void
  getCurrentPageInfo: () => { pageNumber: number }
  getNumberOfPages: () => number
  putTotalPages: (placeholder: string) => void
  addImage: (image: string, format: string, x: number, y: number, w: number, h: number) => void
  getImageProperties: (image: string) => { width: number; height: number }
  output: (type: 'blob') => Blob
}

export async function buildExportPdf(table: ExportTable, logoDataUrl?: string | null): Promise<Blob> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = autoTableModule.default
  const wide = table.blocks.some((block) => (block.columns?.length ?? 0) > 7)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: wide ? 'landscape' : 'portrait' }) as unknown as JsPdfWithAutoTable
  const pdf = doc as unknown as Parameters<typeof autoTable>[0]
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 12
  const generated = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())
  const hasLogo = typeof logoDataUrl === 'string' && logoDataUrl.startsWith('data:image/')

  const drawHeader = () => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(117, 70, 93)
    doc.text('ATELIER DE LA SÉDUCTION', margin, 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(120, 110, 114)
    doc.text('Boutique · Abidjan', margin, 17)
    doc.setFontSize(11)
    doc.setTextColor(51, 46, 49)
    doc.text(table.title, margin, 24)
    if (table.subtitle) {
      doc.setFontSize(8)
      doc.setTextColor(139, 129, 131)
      doc.text(table.subtitle, margin, 29)
    }
    if (hasLogo && logoDataUrl) {
      try {
        const format = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
        const props = doc.getImageProperties(logoDataUrl)
        const ratio = Math.min(22 / props.width, 16 / props.height)
        const w = props.width * ratio
        const h = props.height * ratio
        doc.addImage(logoDataUrl, format, pageW - margin - w, 7, w, h)
      } catch {
        // Logo corrompu : l'en-tête texte reste lisible, sans décalage.
      }
    }
    doc.setDrawColor(232, 223, 220)
    doc.setLineWidth(0.3)
    doc.line(margin, 32, pageW - margin, 32)
    doc.setFontSize(8)
    doc.setTextColor(139, 129, 131)
    doc.text(`Généré le ${generated} · Page ${doc.getCurrentPageInfo().pageNumber}/{total_pages_count_string}`, margin, pageH - 8)
  }

  let y = 38
  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 16) {
      doc.addPage()
      drawHeader()
      y = 38
    }
  }

  for (const block of table.blocks) {
    if (block.title) {
      ensureSpace(12)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(117, 70, 93)
      doc.text(block.title, margin, y)
      y += 6
    }
    if (block.rows.length === 0) {
      ensureSpace(10)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(139, 129, 131)
      doc.text('Aucune donnée sur cette période.', margin, y + 4)
      y += 10
      continue
    }
    autoTable(pdf, {
      head: block.columns ? [block.columns.map(String)] : undefined,
      body: block.rows.map((row) => row.map((cell) => String(cell ?? ''))),
      startY: y,
      margin: { left: margin, right: margin, top: 36, bottom: 16 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [117, 70, 93], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 246, 245] },
      didDrawPage: () => drawHeader(),
    })
    y = (doc.lastAutoTable?.finalY ?? y) + 8
    if (block.totals?.length) {
      ensureSpace(block.totals.length * 6 + 4)
      for (const total of block.totals) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(51, 46, 49)
        doc.text(total.label, pageW - margin - 55, y, { align: 'right' })
        doc.text(String(total.value), pageW - margin, y, { align: 'right' })
        y += 6
      }
      y += 4
    }
  }

  doc.putTotalPages('{total_pages_count_string}')
  return doc.output('blob')
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
