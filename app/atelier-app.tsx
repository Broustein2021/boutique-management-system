'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  BarChart3,
  Bell,
  Boxes,
  CalendarRange,
  Check,
  ChevronDown,
  CircleDollarSign,
  Copy,
  Download,
  FileText,
  Heart,
  History,
  ImagePlus,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Package,
  Pencil,
  Phone,
  Plus,
  Power,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Trash2,
  TrendingUp,
  Upload,
  UserPlus,
  UserRound,
  UserX,
  Users,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react'

import type { CartLine, InitialData, ProductDTO, ReceiptData, Section } from '@/lib/types'
import { signOut } from 'next-auth/react'
import { AppLogo, ReceiptMark } from '@/components/AppLogo'
import { addCustomer, addExpense, addProduct, adjustStock, anonymizeCustomer, changePassword, deleteProduct, exportCSV, exportReport, importProducts, inviteUser, refundSale, registerSale, removeStoreLogo, resetPassword, toggleProductActive, updateProduct, updateUserRole, updateUserStatus, uploadStoreLogo } from './actions'
import { passwordError, passwordStrength } from '@/lib/password-rules'
import { detectSeparator, parseCSV, toNumber } from '@/lib/csv'
import { buildExportPdf, saveBlob } from '@/lib/pdf'
import { can, USER_ROLES } from '@/lib/permissions'

const readImageAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Image illisible.'))
      img.onload = () => {
        const MAX = 480
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas indisponible.'))
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })

const navItems: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'ventes', label: 'Ventes & caisse', icon: ShoppingCart },
  { id: 'clientes', label: 'Clientes & répertoire', icon: UsersRound },
  { id: 'produits', label: 'Produits', icon: Package },
  { id: 'stock', label: 'Gestion du stock', icon: Boxes },
  { id: 'depenses', label: 'Dépenses', icon: FileText },
  { id: 'rapports', label: 'Rapports', icon: BarChart3 },
  { id: 'utilisateurs', label: 'Utilisateurs', icon: Users },
  { id: 'journal', label: 'Journal d’activité', icon: History },
  { id: 'parametres', label: 'Paramètres', icon: Settings },
]

const CATEGORIES = [
  'Ensemble', 'Robe', 'Bijou', 'Lingerie', 'Sous-vêtement',
  'Haut', 'Accessoire', 'Par-dessus', 'Body', 'Corset', 'Pyjama',
]
const EXPENSE_CATEGORIES = ['Immobilier', 'Achats', 'Fournitures', 'Marketing', 'Charges', 'Autres']
const STOCK_REASONS = ['Réassort', 'Ajustement', 'Perte', 'Retour fournisseur']
const REFUND_REASONS = ['Remboursement', 'Échange', "Erreur d'encaissement", 'Produit défectueux']

const formatMoney = (value: number) =>
  new Intl.NumberFormat('fr-FR').format(value) + ' FCFA'

const formatCompact = (value: number) =>
  new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 2 }).format(value)

const money = (value: number) => new Intl.NumberFormat('fr-FR').format(value) + ' FCFA'

const normalizeWaNumber = (raw: string): string | null => {
  let digits = raw.replace(/[^\d]/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 8) digits = `225${digits}`
  else if (digits.startsWith('0')) digits = `225${digits.slice(1)}`
  if (!digits.startsWith('225') || digits.length < 11 || digits.length > 15) return null
  return digits
}

const buildReceiptText = (receipt: ReceiptData): string => {
  const line = '--------------------------------'
  return [
    '*ATELIER DE LA SÉDUCTION*',
    'Boutique · Abidjan',
    line,
    `N° ${String(receipt.invoiceId ?? receipt.id).padStart(4, '0')}`,
    `${receipt.dateLabel} · ${receipt.hourLabel}`,
    `Cliente : ${receipt.customer}`,
    line,
    ...receipt.lines.flatMap((item) => [
      item.article,
      `Réf. ${item.sku}${item.size ? ` · Taille ${item.size}` : ''} · ${item.quantity} × ${money(item.unitPrice)}`,
      `Sous-total : ${money(item.subtotal)}`,
    ]),
    line,
    `*TOTAL : ${money(receipt.invoiceTotal ?? receipt.total)}*`,
    `Paiement : ${receipt.method}`,
    `Vendeuse : ${receipt.seller}`,
    line,
    'Merci de votre visite !',
    'À très vite à l’Atelier de la Séduction',
  ].join('\n')
}

const buildReceiptPdf = async (receipt: ReceiptData, logoDataUrl?: string | null): Promise<Blob> => {
  const { jsPDF } = await import('jspdf')
  const w = 80
  const margin = 6
  const height = Math.max(120, 92 + receipt.lines.length * 17)
  const doc = new jsPDF({ unit: 'mm', format: [w, height] })
  const center = (text: string, y: number, style: 'normal' | 'bold' = 'normal', size = 9) => {
    doc.setFont('courier', style)
    doc.setFontSize(size)
    doc.text(text, w / 2, y, { align: 'center' })
  }
  const sep = (y: number) => center('--------------------------------', y, 'normal', 6)

  let y = 7
  if (logoDataUrl && logoDataUrl.startsWith('data:image/')) {
    try {
      const format = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      const props = doc.getImageProperties(logoDataUrl)
      const ratio = Math.min(24 / props.width, 16 / props.height)
      const imgW = props.width * ratio
      const imgH = props.height * ratio
      doc.addImage(logoDataUrl, format, (w - imgW) / 2, y, imgW, imgH)
      y += imgH + 2
    } catch {
      // Logo illisible : on continue avec l'en-tête texte, sans trou de mise en page.
    }
  }
  center('ATELIER DE LA SÉDUCTION', y, 'bold', 12); y += 5
  center('Boutique · Abidjan', y, 'normal', 8); y += 4.5
  sep(y); y += 4.5
  center(`N° ${String(receipt.invoiceId ?? receipt.id).padStart(4, '0')}`, y); y += 4.5
  center(`${receipt.dateLabel} · ${receipt.hourLabel}`, y, 'normal', 8); y += 4.5
  center(`Cliente : ${receipt.customer}`, y, 'normal', 8); y += 5
  sep(y); y += 5
  for (const item of receipt.lines) {
    doc.setFont('courier', 'bold')
    doc.setFontSize(9)
    const nameLines = doc.splitTextToSize(item.article, w - margin * 2 - 22) as string[]
    doc.text(nameLines, margin, y)
    doc.text(money(item.subtotal), w - margin, y, { align: 'right' })
    y += nameLines.length * 4.2
    doc.setFont('courier', 'normal')
    doc.setFontSize(7.5)
    doc.text(`Réf. ${item.sku}${item.size ? ` · Taille ${item.size}` : ''} · ${item.quantity} × ${money(item.unitPrice)}`, margin, y)
    y += 5.5
  }
  sep(y); y += 5
  doc.setFont('courier', 'bold')
  doc.setFontSize(11)
  doc.text('TOTAL', margin, y)
  doc.text(money(receipt.invoiceTotal ?? receipt.total), w - margin, y, { align: 'right' })
  y += 6.5
  doc.setFont('courier', 'normal')
  doc.setFontSize(8.5)
  doc.text(`Paiement : ${receipt.method}`, margin, y); y += 4.5
  doc.text(`Vendeuse : ${receipt.seller}`, margin, y); y += 5
  sep(y); y += 5
  center('Merci de votre visite !', y, 'bold', 9); y += 4.5
  center('À très vite à l’Atelier', y, 'normal', 8)
  return doc.output('blob')
}

export function AtelierApp({ initial, user }: { initial: InitialData; user: { name: string; email: string; role?: string; initials: string } }) {
  const router = useRouter()
  const [section, setSection] = useState<Section>('dashboard')
  const [logoBusy, setLogoBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [modal, setModal] = useState<null | 'sale' | 'product' | 'stock' | 'expense' | 'import'>(null)
  const [editTarget, setEditTarget] = useState<ProductDTO | null>(null)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProductDTO | null>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [waNumber, setWaNumber] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<{ title: string; rows: number; sample: Array<Array<string>> } | null>(null)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const [importBusy, setImportBusy] = useState(false)

  const products = initial.products
  const isAdmin = can(user.role, 'users')
  const canCatalog = can(user.role, 'catalog')
  const canAdjustStock = can(user.role, 'stock')
  const canSeeExpenses = can(user.role, 'expenses')
  const canSeeActivity = can(user.role, 'activity')
  const canSeeCustomers = can(user.role, 'customers')
  const canSales = can(user.role, 'sales')
  const activeProducts = products.filter((p) => p.active)
  const filteredProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query.toLowerCase()) &&
          (catFilter === 'all' || product.category === catFilter) &&
          (showArchived || product.active),
      ),
    [products, query, catFilter, showArchived],
  )
  const lowStock = activeProducts.filter((product) => product.stock <= product.min)

  const [saleProductId, setSaleProductId] = useState(() => activeProducts.find((p) => p.stock > 0)?.id ?? 0)
  const [saleSearch, setSaleSearch] = useState('')
  const [saleSize, setSaleSize] = useState('')
  const [saleQty, setSaleQty] = useState(1)
  const [saleNotice, setSaleNotice] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [saleMethod, setSaleMethod] = useState('Espèces')
  const [saleCustomerId, setSaleCustomerId] = useState<number | 0>(0)
  const [saleNewCustomer, setSaleNewCustomer] = useState({ open: false, name: '', phone: '' })
  const selectedSaleProduct = activeProducts.find((p) => p.id === saleProductId)
  const productHasSizes = !!selectedSaleProduct?.sizes && Object.keys(selectedSaleProduct.sizes).length > 0
  const canEditPrice = canCatalog || can(user.role, 'stock')
  const cartTotal = cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  const searchMatches = useMemo(() => {
    const needle = saleSearch.trim().toLowerCase()
    return activeProducts.filter((product) => !needle || `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(needle)).slice(0, 8)
  }, [activeProducts, saleSearch])

  const availableFor = (product: ProductDTO, size: string | null) =>
    product.sizes && size ? (product.sizes[size] ?? 0) : product.stock

  const addCartLine = () => {
    if (!selectedSaleProduct) return setSaleNotice('Choisissez un article dans la liste.')
    const product = selectedSaleProduct
    const size = productHasSizes ? (saleSize || null) : null
    if (productHasSizes && !size) return setSaleNotice('Choisissez une taille pour cet article.')
    const qty = Math.trunc(Number(saleQty))
    if (!Number.isInteger(qty) || qty <= 0) return setSaleNotice('La quantité doit être supérieure à zéro.')
    const available = availableFor(product, size)
    if (available <= 0) return setSaleNotice(`« ${product.name} » est en rupture de stock.`)
    const key = `${product.id}|${size ?? ''}`
    setCart((lines) => {
      const existing = lines.find((line) => line.key === key)
      if (existing) {
        if (existing.quantity + qty > available) {
          setSaleNotice(`Stock disponible : ${available} pour « ${product.name} »${size ? ` — Taille ${size}` : ''}.`)
          return lines
        }
        return lines.map((line) => line.key === key ? { ...line, quantity: line.quantity + qty } : line)
      }
      if (qty > available) {
        setSaleNotice(`Stock disponible : ${available} pour « ${product.name} »${size ? ` — Taille ${size}` : ''}.`)
        return lines
      }
      return [...lines, { key, productId: product.id, article: product.name, sku: product.sku, color: product.color, initials: product.initials, size, quantity: qty, unitPrice: product.price, available }]
    })
    setSaleNotice('')
  }

  const setCartQty = (key: string, value: number) => {
    const qty = Math.trunc(Number(value))
    setCart((lines) => lines.map((line) => {
      if (line.key !== key) return line
      if (!Number.isFinite(qty) || qty <= 0) return line
      if (qty > line.available) {
        setSaleNotice(`Stock disponible : ${line.available} pour « ${line.article} ».`)
        return line
      }
      return { ...line, quantity: qty }
    }))
  }

  const setCartPrice = (key: string, value: number) => {
    if (!canEditPrice) return
    const price = Math.trunc(Number(value))
    if (!Number.isFinite(price) || price < 0) return
    setCart((lines) => lines.map((line) => line.key === key ? { ...line, unitPrice: price } : line))
  }

  const removeCartLine = (key: string) => setCart((lines) => lines.filter((line) => line.key !== key))

  const resetSaleCart = () => {
    setCart([])
    setSaleSearch('')
    setSaleQty(1)
    setSaleSize('')
    setSaleNotice('')
    setSaleCustomerId(0)
    setSaleNewCustomer({ open: false, name: '', phone: '' })
  }

  const [productForm, setProductForm] = useState({ name: '', sku: '', category: 'Ensemble', price: '', purchasePrice: '', stock: '', min: '', image: '', categoryCustom: false, sizesEnabled: false, sizeRows: [{ size: '', qty: '' }, { size: '', qty: '' }, { size: '', qty: '' }, { size: '', qty: '' }] })
  const [stockForm, setStockForm] = useState({ productId: 0, newStock: '', reason: 'Réassort', sizeRows: [] as { size: string; qty: string }[] })
  const [expenseForm, setExpenseForm] = useState({ label: '', category: 'Achats', amount: '' })
  const [refundTarget, setRefundTarget] = useState<InitialData['recentSales'][number] | null>(null)
  const [refundReason, setRefundReason] = useState('Remboursement')

  const { stats } = initial

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(true)
    const result = await action()
    setBusy(false)
    setModal(null)
    setEditTarget(null)
    setToast(result.ok ? success : (result.error ?? 'Une erreur est survenue.'))
    if (result.ok) router.refresh()
  }

  const submitSale = async () => {
    if (cart.length === 0) return setToast('Ajoutez au moins un article avant de valider.')
    setBusy(true)
    let customerId: number | null = saleCustomerId || null
    let customerName = ''
    if (saleNewCustomer.open && saleNewCustomer.name.trim()) {
      const created = await addCustomer({ name: saleNewCustomer.name.trim(), phone: saleNewCustomer.phone.trim() })
      if (!created.ok) {
        setBusy(false)
        return setToast(created.error ?? 'Impossible de créer la cliente.')
      }
      customerId = created.id ?? null
      customerName = saleNewCustomer.name.trim()
    }
    const result = await registerSale({
      items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, size: line.size })),
      paymentMethod: saleMethod,
      customerName,
      customerId,
    })
    setBusy(false)
    if (result.ok) {
      setModal(null)
      setToast(`Facture enregistrée — reçu disponible`)
      setReceipt(result.receipt ?? null)
      resetSaleCart()
      router.refresh()
    } else {
      setToast(result.error ?? 'Une erreur est survenue.')
    }
  }

  const submitRefund = async () => {
    if (!refundTarget) return
    setBusy(true)
    const result = await refundSale({ saleId: refundTarget.id, reason: refundReason })
    setBusy(false)
    setRefundTarget(null)
    if (result.ok) {
      setToast('Vente remboursée — stock restauré')
      router.refresh()
    } else {
      setToast(result.error ?? 'Remboursement impossible.')
    }
  }

  const downloadCSV = async (kind: 'sales' | 'products' | 'expenses' | 'customers', label: string, filters?: { period: 'today' | 'week' | 'month' | 'all'; type: 'sales' | 'refunds' | 'all'; seller: string }, format: 'csv' | 'pdf' = 'csv') => {
    setBusy(true)
    const result = await exportCSV(kind, filters)
    if (result.ok && format === 'pdf' && result.pdf) {
      const blob = await buildExportPdf(result.pdf, initial.storeLogo)
      saveBlob(blob, (result.filename ?? `${label}.csv`).replace(/\.csv$/, '.pdf'))
    } else {
      await saveDownload(result, label)
    }
    setBusy(false)
  }

  const downloadReport = async (format: 'csv' | 'pdf' = 'csv') => {
    setBusy(true)
    const result = await exportReport()
    if (result.ok && format === 'pdf' && result.pdf) {
      const blob = await buildExportPdf(result.pdf, initial.storeLogo)
      saveBlob(blob, (result.filename ?? 'rapport.csv').replace(/\.csv$/, '.pdf'))
    } else {
      await saveDownload(result, 'rapport')
    }
    setBusy(false)
  }

  // Le logo est redimensionné côté client avant l'upload : une Server Action ne peut
  // pas recevoir une image lourde (limite de sérialisation ~1 Mo sur Next.js).
  const resizeLogo = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('Image illisible.'))
      image.onload = () => {
        const max = 256
        const ratio = Math.min(1, max / Math.max(image.width, image.height))
        const width = Math.max(1, Math.round(image.width * ratio))
        const height = Math.max(1, Math.round(image.height * ratio))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Traitement de l’image indisponible.'))
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(image, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })

  const pickLogo = async (file?: File | null) => {
    if (!file || !isAdmin) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setToast('Format accepté : PNG ou JPG.')
    if (file.size > 2_000_000) return setToast('Logo trop volumineux (2 Mo maximum).')
    setLogoBusy(true)
    try {
      const result = await uploadStoreLogo(await resizeLogo(file))
      if (!result.ok) return setToast(result.error ?? 'Enregistrement impossible.')
      setToast('Logo enregistré pour toute la boutique')
      router.refresh()
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Traitement de l’image impossible.')
    } finally {
      setLogoBusy(false)
    }
  }

  const clearLogo = async () => {
    setLogoBusy(true)
    const result = await removeStoreLogo()
    setLogoBusy(false)
    if (!result.ok) return setToast(result.error ?? 'Suppression impossible.')
    setToast('Logo par défaut restauré')
    router.refresh()
  }

  const handleAddCustomer = async (input: { name: string; phone: string }) => {
    setBusy(true)
    const result = await addCustomer({ name: input.name, phone: input.phone })
    setBusy(false)
    if (!result.ok) return { ok: false, error: result.error ?? 'Ajout impossible.' }
    setToast('Cliente ajoutée au répertoire')
    router.refresh()
    return { ok: true }
  }

  const handleAnonymize = async (customerId: number) => {
    const result = await anonymizeCustomer(customerId)
    if (result.ok) setToast('Données anonymisées')
    if (result.ok) router.refresh()
    return result
  }

  const saveDownload = async (result: { ok: boolean; error?: string; csv?: string; filename?: string }, label: string) => {
    if (!result.ok || !result.csv) return setToast(result.error ?? 'Export impossible.')
    const blob = new Blob(['\uFEFF' + result.csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = result.filename ?? `${label}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setToast(`${label} exporté en CSV`)
  }

  const downloadTemplate = () => {
    const csv = "Référence;Nom;Catégorie;Prix;Coût d'achat;Stock;Seuil min.\r\nENS-SOF-100;Ensemble Sofia;Ensemble;19000;9500;10;4"
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'modele-produits.csv'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  function importColumnsByHeader(header: Array<string>): number[] {
    const norm = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const find = (keys: string[]) => header.findIndex((cell) => keys.some((key) => norm(String(cell)) === key || norm(String(cell)).includes(key)))
    const sku = find(['ref', 'reference', 'referenceproduit'])
    const name = find(['nom', 'modele'])
    const category = find(['categorie'])
    const purchase = find(['cout', 'couth', 'coutdachat', 'prixdachat', 'prixachat'])
    const price = header.findIndex((cell, index) => index !== purchase && norm(String(cell)).includes('prix') && !norm(String(cell)).includes('achat') && !norm(String(cell)).includes('cout'))
    const stock = find(['stock'])
    const min = find(['min'])
    if ([sku, name, price, stock].some((index) => index === -1)) return [-1, -1, -1, -1, -1, -1, -1]
    return [sku, name, category, purchase, price, stock, min]
  }

  const handleImportFile = (file: File | null) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return setToast('Fichier trop volumineux (max 2 Mo).')
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const rows = parseCSV(text, detectSeparator(text))
      if (rows.length < 2) return setToast('Fichier vide ou illisible.')
      setImportFile(file)
      setImportResult(null)
      setImportPreview({ title: file.name, rows: rows.length - 1, sample: rows.slice(1, 4).map((row) => row.map(String)) })
    }
    reader.onerror = () => setToast('Impossible de lire ce fichier.')
    reader.readAsText(file)
  }

  const buildImportRows = (text: string): Array<{ name: string; sku: string; category: string; price: number; purchasePrice: number; stock: number; min: number }> => {
    const rows = parseCSV(text, detectSeparator(text))
    if (!rows.length) return []
    const [skuCol, nameCol, categoryCol, purchaseCol, priceCol, stockCol, minCol] = importColumnsByHeader(rows[0].map(String))
    const pick = (row: Array<string | number>, index: number, fallback: number) =>
      index >= 0 && index < row.length ? String(row[index]) : String(row[fallback] ?? '')
    return rows.slice(1).map((row) => ({
      name: pick(row, nameCol, 1).trim(),
      sku: pick(row, skuCol, 0).trim(),
      category: pick(row, categoryCol, 2).trim(),
      price: toNumber(pick(row, priceCol, 3) || 0),
      purchasePrice: purchaseCol >= 0 ? toNumber(pick(row, purchaseCol, 3) || 0) : 0,
      stock: toNumber(pick(row, stockCol, 4) || 0),
      min: toNumber(pick(row, minCol, 5) || 3),
    }))
  }

  const submitImport = async () => {
    if (!importFile) return
    setImportBusy(true)
    let text = ''
    try {
      text = await importFile.text()
    } catch {
      setImportBusy(false)
      return setToast('Impossible de lire ce fichier.')
    }
    const result = await importProducts({ rows: buildImportRows(text) })
    setImportBusy(false)
    if (!result.ok) return setToast(result.error ?? 'Import impossible.')
    setImportResult({ imported: result.imported, skipped: result.skipped, errors: result.errors })
    if (result.imported > 0) router.refresh()
  }

  const sendViaWhatsApp = async () => {
    if (!receipt) return
    const number = normalizeWaNumber(waNumber)
    if (!number) return setToast('Numéro invalide — exemple : +225 07 07 07 07 07')
    const fallback = () => {
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(buildReceiptText(receipt))}`, '_blank', 'noopener,noreferrer')
      setToast('PDF téléchargé — joignez-le dans WhatsApp')
    }
    const canShareFiles = typeof navigator !== 'undefined' && 'share' in navigator && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'recu.pdf', { type: 'application/pdf' })] })
    if (canShareFiles) {
      try {
        const blob = await buildReceiptPdf(receipt, initial.storeLogo)
        const file = new File([blob], `recu-${String(receipt.invoiceId ?? receipt.id).padStart(4, '0')}.pdf`, { type: 'application/pdf' })
        await navigator.share({
          title: `Reçu ${String(receipt.invoiceId ?? receipt.id).padStart(4, '0')} — Atelier de la Séduction`,
          text: `${receipt.article} — ${money(receipt.invoiceTotal ?? receipt.total)}`,
          files: [file],
        })
        return
      } catch (error) {
        if ((error as Error | undefined)?.name === 'AbortError') return
      }
    }
    await downloadReceiptPdf()
    fallback()
  }

  const downloadReceiptPdf = async () => {
    if (!receipt) return
    const blob = await buildReceiptPdf(receipt, initial.storeLogo)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `recu-${String(receipt.invoiceId ?? receipt.id).padStart(4, '0')}.pdf`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setToast('Reçu PDF téléchargé')
  }

  const buildSizes = (rows: { size: string; qty: string }[]): Record<string, number> | null => {
    const sizes: Record<string, number> = {}
    for (const row of rows) {
      const size = row.size.trim().toUpperCase()
      const qty = Math.round(Number(row.qty))
      if (!size && qty <= 0) continue
      if (!size) continue
      if (qty > 0) sizes[size] = qty
    }
    return Object.keys(sizes).length > 0 ? sizes : null
  }

  const submitProduct = () => {
    const sizes = productForm.sizesEnabled ? buildSizes(productForm.sizeRows) : null
    if (editTarget) {
      run(
        () => updateProduct({ id: editTarget.id, name: productForm.name, category: productForm.category, price: Number(productForm.price), purchasePrice: Number(productForm.purchasePrice), min: Number(productForm.min), image: productForm.image || null, sizes }),
        'Article mis à jour',
      )
    } else {
      run(
        () =>
          addProduct({
            name: productForm.name,
            sku: productForm.sku,
            category: productForm.category,
            price: Number(productForm.price),
            purchasePrice: Number(productForm.purchasePrice),
            stock: Number(productForm.stock),
            min: Number(productForm.min),
            image: productForm.image || null,
            sizes,
          }),
        'Produit ajouté au catalogue',
      )
    }
  }

  const openAddProduct = () => {
    setEditTarget(null)
    setProductForm({ name: '', sku: '', category: 'Ensemble', price: '', purchasePrice: '', stock: '', min: '', image: '', categoryCustom: false, sizesEnabled: false, sizeRows: [{ size: '', qty: '' }, { size: '', qty: '' }, { size: '', qty: '' }, { size: '', qty: '' }] })
    setModal('product')
  }

  const openEditProduct = (product: ProductDTO) => {
    setOpenMenuId(null)
    setEditTarget(product)
    const sizeEntries = product.sizes ? Object.entries(product.sizes) : []
    setProductForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: String(product.price),
      purchasePrice: String(product.purchasePrice),
      stock: '0',
      min: String(product.min),
      image: product.image ?? '',
      categoryCustom: !initial.allCategories.includes(product.category),
      sizesEnabled: sizeEntries.length > 0,
      sizeRows: sizeEntries.length > 0 ? sizeEntries.map(([size, qty]) => ({ size, qty: String(qty) })) : [{ size: '', qty: '' }, { size: '', qty: '' }, { size: '', qty: '' }, { size: '', qty: '' }],
    })
    setModal('product')
  }

  const pickPhoto = async (file?: File | null) => {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) return setToast('Image trop lourde (max 8 Mo).')
    try {
      const dataUrl = await readImageAsDataUrl(file)
      setProductForm((form) => ({ ...form, image: dataUrl }))
    } catch {
      setToast('Impossible de lire cette image.')
    }
  }

  const submitArchive = async (product: ProductDTO) => {
    setOpenMenuId(null)
    setBusy(true)
    const result = await toggleProductActive(product.id)
    setBusy(false)
    setToast(result.ok ? (result.archived ? 'Article archivé — caché des ventes et du stock.' : 'Article réactivé.') : (result.error ?? 'Une erreur est survenue.'))
    if (result.ok) router.refresh()
  }

  const submitDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    setOpenMenuId(null)
    const result = await deleteProduct(deleteTarget.id)
    setBusy(false)
    setDeleteTarget(null)
    setToast(result.ok ? 'Article supprimé définitivement.' : (result.error ?? 'Une erreur est survenue.'))
    if (result.ok) router.refresh()
  }

  const submitStock = () => {
    const target = activeProducts.find((p) => p.id === stockForm.productId)
    if (target?.sizes) {
      return run(
        () => adjustStock({ productId: stockForm.productId, newStock: 0, reason: stockForm.reason, sizes: buildSizes(stockForm.sizeRows) }),
        'Stock mis à jour',
      )
    }
    return run(
      () => adjustStock({ productId: stockForm.productId, newStock: Number(stockForm.newStock), reason: stockForm.reason }),
      'Stock mis à jour',
    )
  }

  const submitExpense = () =>
    run(
      () => addExpense({ label: expenseForm.label, category: expenseForm.category, amount: Number(expenseForm.amount) }),
      'Dépense enregistrée',
    )

  const displayName = user.name || user.email || 'Utilisateur'

  const handleInvite = async ({ name, email, role }: { name: string; email: string; role: string }) => {
    const result = await inviteUser({ name, email, role })
    if (result.ok) router.refresh()
    return result
  }

  const handleUpdateRole = async (userId: number, role: string) => {
    const result = await updateUserRole(userId, role)
    if (result.ok) router.refresh()
    return result
  }

  const handleUpdateStatus = async (userId: number, status: 'Actif' | 'Suspendu') => {
    const result = await updateUserStatus(userId, status)
    if (result.ok) router.refresh()
    return result
  }

  const handleResetPassword = async (userId: number) => {
    const result = await resetPassword(userId)
    if (result.ok) router.refresh()
    return result
  }

  const submitPassword = async () => {
    setPwError(null)
    if (!pwForm.current) return setPwError('Saisissez votre mot de passe actuel.')
    if (!pwForm.next) return setPwError('Choisissez un nouveau mot de passe.')
    if (pwForm.next !== pwForm.confirm) return setPwError('La confirmation ne correspond pas.')
    const weakness = passwordError(pwForm.next)
    if (weakness) return setPwError(`Mot de passe trop faible — ${weakness}`)
    setPwBusy(true)
    const result = await changePassword({ currentPassword: pwForm.current, newPassword: pwForm.next })
    setPwBusy(false)
    if (!result.ok) return setPwError(result.error ?? 'Une erreur est survenue.')
    setToast('Mot de passe mis à jour')
    setPwOpen(false)
    setPwForm({ current: '', next: '', confirm: '' })
  }

  const pwScore = passwordStrength(pwForm.next)
  const pwScoreLabel = pwScore === 0 ? 'Faible' : pwScore === 1 ? 'Moyen' : pwScore === 2 ? 'Bon' : 'Excellent'

  return (
    <main className="boutique-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><div className="brand-mark"><AppLogo size={31} /></div><div><strong>Atelier de la Séduction</strong><span>Gestion boutique</span></div><button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu"><X size={19} /></button></div>
        <div className="store-switcher"><div className="store-avatar">AS</div><div><strong>Atelier de la Séduction</strong><span>Boutique principale</span></div><ChevronDown size={15} /></div>
        <nav className="main-nav" aria-label="Navigation principale">{navItems.filter(({ id }) => (id !== 'depenses' || canSeeExpenses) && (id !== 'utilisateurs' || isAdmin) && (id !== 'journal' || canSeeActivity) && (id !== 'clientes' || canSeeCustomers) && (id !== 'produits' || canCatalog) && (id !== 'stock' || canAdjustStock) && (id !== 'rapports' || canSeeExpenses) && (id !== 'parametres' || isAdmin)).map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? 'nav-item active' : 'nav-item'} onClick={() => { setSection(id); setSidebarOpen(false) }}><Icon size={18} /><span>{label}</span>{id === 'stock' && lowStock.length > 0 && <b className="nav-badge">{lowStock.length}</b>}</button>)}</nav>
<div className="sidebar-bottom">
        <button className="nav-item" onClick={() => signOut({ callbackUrl: '/login' })}><LogOut size={18} /><span>Se déconnecter</span></button>
          <div className="profile-wrap"><div className="profile-mini" role="button" tabIndex={0} onClick={() => setProfileOpen((value) => !value)} onKeyDown={(event) => { if (event.key === 'Enter') setProfileOpen((value) => !value) }}><div className="avatar">{user.initials}</div><div><strong>{displayName}</strong><span>{user.role ?? 'Équipière'}</span></div><ChevronDown size={15} /></div>{profileOpen && <div className="profile-menu"><button onClick={() => { setProfileOpen(false); setPwOpen(true); setPwError(null) }}><KeyRound size={14} /> Changer mon mot de passe</button></div>}</div>
        </div>
      </aside>

      <section className="app-content">
        <header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Ouvrir le menu"><Menu size={21} /></button><div className="breadcrumb"><span>Atelier de la Séduction</span><span>/</span><strong>{navItems.find((item) => item.id === section)?.label}</strong></div><div className="top-actions"><label className="search-field"><Search size={17} /><input placeholder="Rechercher..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="notification-wrap"><button className="icon-button" aria-label="Notifications" onClick={() => setBellOpen((value) => !value)}><Bell size={19} />{lowStock.length > 0 && <i />}</button>{bellOpen && <div className="notification-popover"><strong className="notification-title">Alertes stock</strong>{lowStock.length > 0 ? <><p><AlertTriangle size={14} /> {lowStock.length} référence(s) sous le seuil minimum</p><div className="notification-list">{lowStock.slice(0, 8).map((product) => <div className="notification-item" key={product.id}><span>{product.name}</span><b>{product.stock} restant(s)</b></div>)}</div><button className="text-button" onClick={() => { setSection('stock'); setBellOpen(false) }}>Voir le stock</button></> : <p className="notification-empty">Aucune alerte pour le moment.</p>}</div>}</div><div className="top-avatar">{user.initials}</div></div></header>

        <div className="page-container">
          {section === 'dashboard' && <Dashboard initial={initial} products={products} onNewSale={() => setModal('sale')} onNavigate={setSection} userName={displayName} />}
          {section === 'ventes' && <Sales initial={initial} onNewSale={() => setModal('sale')} onExport={(filters, format) => void downloadCSV('sales', 'ventes', filters, format)} onReceipt={setReceipt} onRefund={(sale) => { setRefundReason('Remboursement'); setRefundTarget(sale) }} canRefund={canSales} />}
          {canCatalog && section === 'produits' && <Products allProducts={activeProducts} products={filteredProducts} categories={initial.allCategories} currentCategory={catFilter} onCategoryChange={setCatFilter} onAdd={openAddProduct} onEdit={openEditProduct} onArchive={submitArchive} onRequestDelete={(product) => { setOpenMenuId(null); setDeleteTarget(product) }} onImport={() => setModal('import')} onExport={(format) => void downloadCSV('products', 'catalogue', undefined, format)} showArchived={showArchived} onToggleArchived={() => setShowArchived((value) => !value)} openMenuId={openMenuId} onMenuToggle={setOpenMenuId} canManage={canCatalog} />}
          {canAdjustStock && section === 'stock' && <Stock products={activeProducts} valueCost={initial.stats.stockValueCost} valueRetail={initial.stats.stockValueRetail} onAdjust={() => { setStockForm((f) => ({ ...f, productId: activeProducts[0]?.id ?? f.productId })); setModal('stock') }} canAdjust={canAdjustStock} />}
          {canSeeExpenses && section === 'depenses' && <Expenses initial={initial} onAdd={() => setModal('expense')} onExport={(format) => void downloadCSV('expenses', 'depenses', undefined, format)} />}
          {canSeeExpenses && section === 'rapports' && <Reports initial={initial} onExport={(format) => void downloadReport(format)} />}
          {isAdmin && section === 'utilisateurs' && <UsersSection users={initial.users} currentEmail={user.email} onInvite={handleInvite} onUpdateRole={handleUpdateRole} onUpdateStatus={handleUpdateStatus} onReset={handleResetPassword} />}
          {canSeeCustomers && section === 'clientes' && <CustomersSection initial={initial} onAdd={handleAddCustomer} onAnonymize={handleAnonymize} onExport={downloadCSV} onNewSale={() => setSection('ventes')} />}
          {canSeeActivity && section === 'journal' && <JournalSection activity={initial.activity} />}
          {isAdmin && section === 'parametres' && <SettingsSection logo={initial.storeLogo} busy={logoBusy} onPick={(file) => void pickLogo(file)} onClear={() => void clearLogo()} />}
        </div>
      </section>

      {modal === 'sale' && (
        <div className="modal-backdrop" onClick={() => setModal(null)} onKeyDown={(event) => { if (event.key === 'Escape') setModal(null) }}>
          <div className="sale-modal sale-modal-cart" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="eyebrow">NOUVELLE OPÉRATION</span><h2>Facture multi-articles</h2><p style={{ margin: 0, color: '#8b8183', fontSize: 12 }}>Ajoutez les articles, ajustez les quantités, puis validez en une seule fois.</p></div><button className="icon-button" onClick={() => setModal(null)} aria-label="Fermer"><X size={19} /></button></div>
            <div className="cart-picker">
              <label className="form-label">Rechercher un article
                <input placeholder="Nom ou référence…" value={saleSearch} onChange={(event) => setSaleSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCartLine() } }} autoFocus />
              </label>
              <div className="cart-search-list">
                {searchMatches.length > 0 ? searchMatches.map((product) => (
                  <button type="button" key={product.id} className={`cart-search-item ${product.id === saleProductId ? 'selected' : ''}`} onClick={() => { setSaleProductId(product.id); setSaleSize(''); setSaleNotice('') }}>
                    <span className={`product-thumb ${product.color}`}>{product.initials}</span>
                    <span className="cart-search-name"><strong>{product.name}</strong><small>Réf. {product.sku} · {product.stock} en stock</small></span>
                    <b>{formatMoney(product.price)}</b>
                  </button>
                )) : <p className="empty-note">Aucun article ne correspond à la recherche.</p>}
              </div>
              <div className="cart-add-row">
                <label className="form-label">Quantité <input type="number" min="1" max="999" value={saleQty} onChange={(event) => setSaleQty(Number(event.target.value))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCartLine() } }} /></label>
                {productHasSizes && selectedSaleProduct && (
                  <label className="form-label">Taille {selectedSaleProduct.sizes && <span className="size-hint">({Object.entries(selectedSaleProduct.sizes).filter(([, qty]) => qty > 0).length} dispo.)</span>}
                    <select value={saleSize} onChange={(event) => setSaleSize(event.target.value)}>
                      <option value="">— Choisir —</option>
                      {Object.entries(selectedSaleProduct.sizes ?? {}).map(([size, qty]) => <option key={size} value={size} disabled={qty <= 0}>{size}{qty > 0 ? ` · ${qty} dispo.` : ' · rupture'}</option>)}
                    </select>
                  </label>
                )}
                <button type="button" className="primary-button" onClick={addCartLine}><Plus size={16} /> Ajouter</button>
              </div>
              {saleNotice && <p className="form-error">{saleNotice}</p>}
            </div>
            <div className="cart-lines">
              {cart.length === 0 ? <p className="empty-note">Panier vide — sélectionnez un article ci-dessus.</p> : cart.map((line) => (
                <div className="cart-line" key={line.key}>
                  <div className="cart-line-info"><strong>{line.article}</strong><span>Réf. {line.sku}{line.size ? ` · Taille ${line.size}` : ''} · {line.available} dispo.</span></div>
                  <label className="cart-field">Qté <input type="number" min="1" max={line.available} value={line.quantity} onChange={(event) => setCartQty(line.key, Number(event.target.value))} aria-label={`Quantité ${line.article}`} /></label>
                  <label className="cart-field">P.U. <input type="number" min="0" value={line.unitPrice} onChange={(event) => setCartPrice(line.key, Number(event.target.value))} disabled={!canEditPrice} title={canEditPrice ? 'Prix modifiable' : 'Prix réservé à l’administratrice et à l’associée'} aria-label={`Prix unitaire ${line.article}`} /></label>
                  <strong className="cart-subtotal">{formatMoney(line.quantity * line.unitPrice)}</strong>
                  <button type="button" className="icon-button" onClick={() => removeCartLine(line.key)} aria-label={`Retirer ${line.article}`}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <div className="form-label">Cliente
              <select value={saleNewCustomer.open ? '__new__' : String(saleCustomerId)} onChange={(event) => { setSaleCustomerId(Number(event.target.value)); setSaleNewCustomer((value) => ({ ...value, open: event.target.value === '__new__' })) }}>
                <option value="0">— Cliente occasionnelle —</option>
                {initial.customers.map((client) => <option key={client.id} value={client.id}>{client.name}{client.phone ? ` · ${client.phone}` : ''}</option>)}
                <option value="__new__">+ Nouvelle cliente…</option>
              </select>
            </div>
            {saleNewCustomer.open && <div className="sale-customer-new"><label className="form-label">Nom de la cliente <input placeholder="Ex : Mariam Cissé" value={saleNewCustomer.name} onChange={(event) => setSaleNewCustomer({ ...saleNewCustomer, name: event.target.value })} autoFocus /></label><label className="form-label">Téléphone <input placeholder="Ex : 07 07 07 07 07" value={saleNewCustomer.phone} onChange={(event) => setSaleNewCustomer({ ...saleNewCustomer, phone: event.target.value })} /></label><button type="button" className="text-button" onClick={() => setSaleNewCustomer((value) => ({ ...value, open: false }))}>Revenir au répertoire existant</button></div>}
            <label className="form-label">Moyen de paiement
              <select value={saleMethod} onChange={(event) => setSaleMethod(event.target.value)}><option>Espèces</option><option>Carte bancaire</option><option>Mobile Money</option></select>
            </label>
            <div className="total-row"><span>Total à encaisser ({cart.reduce((sum, line) => sum + line.quantity, 0)} article(s))</span><strong>{formatMoney(cartTotal)}</strong></div>
            <button className="primary-button full" onClick={submitSale} disabled={busy || cart.length === 0}><CircleDollarSign size={17} /> {busy ? 'Enregistrement…' : 'Valider la facture'}</button>
          </div>
        </div>
      )}

      {modal === 'product' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="sale-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="eyebrow">CATALOGUE</span><h2>{editTarget ? 'Modifier le produit' : 'Ajouter un produit'}</h2><p style={{ margin: 0, color: '#8b8183', fontSize: 12 }}>{editTarget ? `Réf. ${editTarget.sku}` : 'Nouvel article du catalogue'}</p></div><button className="icon-button" onClick={() => setModal(null)}><X size={19} /></button></div>
            <label className="form-label">Nom du modèle <input placeholder="Ex : Ensemble Sofia" value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></label>
            {!editTarget && <label className="form-label">Référence (SKU) <input placeholder="Ex : ENS-SOF-006" value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} /></label>}
            <label className="form-label">Catégorie
              {productForm.categoryCustom ? (
                <input placeholder="Saisissez une catégorie…" value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })} autoFocus />
              ) : (
                <select value={productForm.category} onChange={(event) => { if (event.target.value === '__new__') setProductForm({ ...productForm, categoryCustom: true, category: '' }); else setProductForm({ ...productForm, category: event.target.value }) }}>
                  <option value="__new__">+ Nouvelle catégorie…</option>
                  {(initial.allCategories.length > 0 ? initial.allCategories : CATEGORIES).map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              )}
            </label>
            <label className="form-label">Prix (FCFA) <input type="number" min="0" placeholder="Ex : 18900" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></label>
            {(() => { const sale = Number(productForm.price); const cost = Number(productForm.purchasePrice); if (sale > 0 && cost >= 0) { const margin = sale - cost; const pct = sale > 0 ? Math.round((margin / sale) * 100) : 0; return <div className="margin-hint">{cost > 0 ? <>Marge unitaire : <b>{formatMoney(margin)}</b> soit <b>{pct}%</b> du prix de vente</> : <span className="muted-cell">Ajoutez un coût d’achat pour calculer la marge.</span>}</div> } return null })()}
            <label className="form-label">Coût d’achat (FCFA) <input type="number" min="0" placeholder="Ex : 9500" value={productForm.purchasePrice} onChange={(event) => setProductForm({ ...productForm, purchasePrice: event.target.value })} /></label>
            <div className="photo-field">
              {productForm.image ? (
                <div className="photo-preview"><img src={productForm.image} alt="Aperçu de la photo" /><button type="button" className="photo-remove" onClick={() => setProductForm({ ...productForm, image: '' })} aria-label="Retirer la photo"><X size={14} /></button></div>
              ) : (
                <label className="photo-upload"><ImagePlus size={20} /><span>Ajouter une photo</span><small>JPG, PNG ou WebP · optionnel</small><input type="file" accept="image/*" onChange={(event) => { void pickPhoto(event.target.files?.[0]); event.target.value = '' }} /></label>
              )}
            </div>
            {!editTarget && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="form-label">Stock initial <input type="number" min="0" placeholder="10" value={productForm.stock} onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })} /></label>
                <label className="form-label">Seuil min. <input type="number" min="0" placeholder="4" value={productForm.min} onChange={(event) => setProductForm({ ...productForm, min: event.target.value })} /></label>
              </div>
            )}
            {editTarget && <label className="form-label">Seuil min. <input type="number" min="0" placeholder="4" value={productForm.min} onChange={(event) => setProductForm({ ...productForm, min: event.target.value })} /></label>}
            <div className="sizes-block">
              <label className="sizes-toggle"><input type="checkbox" checked={productForm.sizesEnabled} onChange={(event) => { const on = event.target.checked; if (on && productForm.sizeRows.every((r) => !r.size && !r.qty)) setProductForm({ ...productForm, sizesEnabled: on, sizeRows: [{ size: 'S', qty: '' }, { size: 'M', qty: '' }, { size: 'L', qty: '' }, { size: 'XL', qty: '' }] }); else setProductForm({ ...productForm, sizesEnabled: on }) }} /> <span>Ce modèle se décline en tailles (lingerie, sous-vêtements…)</span></label>
              {productForm.sizesEnabled && (
                <div className="sizes-grid">
                  <div className="sizes-head"><span>Taille</span><span>Quantité en stock</span></div>
                  {productForm.sizeRows.map((row, index) => (
                    <div className="sizes-row" key={index}>
                      <input className="size-input" placeholder="Ex : S, M, L, XL, 85B…" value={row.size} onChange={(event) => setProductForm({ ...productForm, sizeRows: productForm.sizeRows.map((r, i) => (i === index ? { ...r, size: event.target.value } : r)) })} />
                      <input className="qty-input" type="number" min="0" placeholder="0" value={row.qty} onChange={(event) => setProductForm({ ...productForm, sizeRows: productForm.sizeRows.map((r, i) => (i === index ? { ...r, qty: event.target.value } : r)) })} />
                      <button type="button" className="size-remove" aria-label="Retirer cette taille" onClick={() => setProductForm({ ...productForm, sizeRows: productForm.sizeRows.filter((_, i) => i !== index) })}><X size={14} /></button>
                    </div>
                  ))}
                  <button type="button" className="text-button" onClick={() => setProductForm({ ...productForm, sizeRows: [...productForm.sizeRows, { size: '', qty: '' }] })}><Plus size={14} /> Ajouter une taille</button>
                </div>
              )}
            </div>
            <button className="primary-button full" onClick={submitProduct} disabled={busy}><Plus size={17} /> {busy ? (editTarget ? 'Enregistrement…' : 'Ajout…') : (editTarget ? 'Enregistrer les modifications' : 'Ajouter au catalogue')}</button>
          </div>
        </div>
      )}

      {modal === 'stock' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="sale-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="eyebrow">INVENTAIRE</span><h2>Ajuster le stock</h2></div><button className="icon-button" onClick={() => setModal(null)}><X size={19} /></button></div>
            <label className="form-label">Produit
              <select value={stockForm.productId} onChange={(event) => { const id = Number(event.target.value); const product = activeProducts.find((p) => p.id === id); setStockForm({ ...stockForm, productId: id, sizeRows: product?.sizes ? Object.entries(product.sizes).map(([size, qty]) => ({ size, qty: String(qty) })) : [] }) }}>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name} — {product.stock} en stock</option>)}</select>
            </label>
            {(() => { const target = activeProducts.find((p) => p.id === stockForm.productId); if (target?.sizes) return <><div className="sizes-grid" style={{ margin: '4px 0 14px' }}><div className="sizes-head"><span>Taille</span><span>Quantité</span><span /></div>{stockForm.sizeRows.map((row, index) => <div className="sizes-row" key={index}><input className="size-input" placeholder="Ex : S" value={row.size} onChange={(event) => setStockForm({ ...stockForm, sizeRows: stockForm.sizeRows.map((r, i) => (i === index ? { ...r, size: event.target.value } : r)) })} /><input className="qty-input" type="number" min="0" placeholder="0" value={row.qty} onChange={(event) => setStockForm({ ...stockForm, sizeRows: stockForm.sizeRows.map((r, i) => (i === index ? { ...r, qty: event.target.value } : r)) })} /><button type="button" className="size-remove" aria-label="Retirer cette taille" onClick={() => setStockForm({ ...stockForm, sizeRows: stockForm.sizeRows.filter((_, i) => i !== index) })}><X size={14} /></button></div>)}</div><button type="button" className="text-button" onClick={() => setStockForm({ ...stockForm, sizeRows: [...stockForm.sizeRows, { size: '', qty: '' }] })}><Plus size={14} /> Ajouter une taille</button><p className="muted-cell" style={{ marginTop: 8 }}>Le stock total sera recalculé.</p></>; return <label className="form-label">Nouveau niveau de stock <input type="number" min="0" placeholder="Ex : 15" value={stockForm.newStock} onChange={(event) => setStockForm({ ...stockForm, newStock: event.target.value })} /></label> })()}
            <label className="form-label">Motif
              <select value={stockForm.reason} onChange={(event) => setStockForm({ ...stockForm, reason: event.target.value })}>{STOCK_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select>
            </label>
            <button className="primary-button full" onClick={submitStock} disabled={busy}><Boxes size={17} /> {busy ? 'Mise à jour…' : 'Mettre à jour le stock'}</button>
          </div>
        </div>
      )}

      {modal === 'expense' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="sale-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="eyebrow">FINANCES</span><h2>Nouvelle dépense</h2></div><button className="icon-button" onClick={() => setModal(null)}><X size={19} /></button></div>
            <label className="form-label">Libellé <input placeholder="Ex : Loyer boutique" value={expenseForm.label} onChange={(event) => setExpenseForm({ ...expenseForm, label: event.target.value })} /></label>
            <label className="form-label">Catégorie
              <select value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })}>{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
            </label>
            <label className="form-label">Montant (FCFA) <input type="number" min="0" placeholder="Ex : 25000" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} /></label>
            <button className="primary-button full" onClick={submitExpense} disabled={busy}><Plus size={17} /> {busy ? 'Enregistrement…' : 'Enregistrer la dépense'}</button>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="sale-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="eyebrow">CATALOGUE</span><h2>Supprimer l’article ?</h2></div><button className="icon-button" onClick={() => setDeleteTarget(null)}><X size={19} /></button></div>
            <div className="confirm-box"><span className="confirm-icon"><Trash2 size={20} /></span><div><p>«&nbsp;{deleteTarget.name}&nbsp;» sera <strong>définitivement supprimé</strong> du catalogue (réf. {deleteTarget.sku}).</p><p className="confirm-note">En revanche, impossible s’il possède des ventes ou mouvements de stock : dans ce cas, archivez l’article à la place.</p></div></div>
            <div className="confirm-actions"><button className="outline-button" onClick={() => setDeleteTarget(null)}>Annuler</button><button className="danger-button" onClick={submitDelete} disabled={busy}>{busy ? 'Suppression…' : 'Supprimer définitivement'}</button></div>
          </div>
        </div>
      )}

      {refundTarget && (
        <div className="modal-backdrop" onClick={() => setRefundTarget(null)}>
          <div className="sale-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="eyebrow">CAISSE</span><h2>Rembourser cette vente ?</h2></div><button className="icon-button" onClick={() => setRefundTarget(null)}><X size={19} /></button></div>
            <div className="confirm-box"><span className="confirm-icon refund"><RotateCcw size={20} /></span><div><p>Vente <strong>N° {String(refundTarget.id).padStart(4, '0')}</strong> — {refundTarget.article} à <strong>{formatMoney(refundTarget.total)}</strong> ({refundTarget.customer}).</p><p className="confirm-note">La vente sera marquée remboursée, exclue du chiffre d’affaires, et l’article <strong>remis en stock</strong>.</p></div></div>
            <label className="form-label">Motif
              <select value={refundReason} onChange={(event) => setRefundReason(event.target.value)}>{(REFUND_REASONS as string[]).map((reason) => <option key={reason}>{reason}</option>)}</select>
            </label>
            <div className="confirm-actions"><button className="outline-button" onClick={() => setRefundTarget(null)}>Annuler</button><button className="danger-button" onClick={() => void submitRefund()} disabled={busy}>{busy ? 'Traitement…' : 'Confirmer le remboursement'}</button></div>
          </div>
        </div>
      )}

      {pwOpen && (
        <div className="modal-backdrop" onClick={() => { setPwOpen(false); setPwError(null) }}>
          <div className="sale-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="eyebrow">SÉCURITÉ</span><h2>Changer mon mot de passe</h2></div><button className="icon-button" onClick={() => { setPwOpen(false); setPwError(null) }}><X size={19} /></button></div>
            <div className="confirm-box" style={{ marginTop: 2 }}><span className="confirm-icon"><KeyRound size={20} /></span><div><p>Protégez votre compte avec un mot de passe robuste.</p><p className="confirm-note">Au moins 8 caractères, avec lettres et chiffres.</p></div></div>
            <label className="form-label">Mot de passe actuel <input type="password" value={pwForm.current} onChange={(event) => setPwForm({ ...pwForm, current: event.target.value })} /></label>
            <label className="form-label">Nouveau mot de passe <input type="password" value={pwForm.next} onChange={(event) => setPwForm({ ...pwForm, next: event.target.value })} /></label>
            <div className="pw-meter">{[0, 1, 2, 3].map((i) => <span key={i} className={i < pwScore ? `lvl${pwScore}` : ''} />)}<b>{pwForm.next ? pwScoreLabel : '…'}</b></div>
            <label className="form-label">Confirmation <input type="password" value={pwForm.confirm} onChange={(event) => setPwForm({ ...pwForm, confirm: event.target.value })} /></label>
            {pwError && <p className="form-error">{pwError}</p>}
            <div className="confirm-actions"><button className="outline-button" onClick={() => setPwOpen(false)}>Annuler</button><button className="primary-button" onClick={() => void submitPassword()} disabled={pwBusy}>{pwBusy ? 'Enregistrement…' : 'Mettre à jour'}</button></div>
          </div>
        </div>
      )}

      {receipt && (
        <div className="modal-backdrop">
          <div className="receipt-card">
            <div className="print-area" id="print-area">
              {initial.storeLogo && <img className="receipt-logo" src={initial.storeLogo} alt="Logo de la boutique" />}
              <div className="receipt-brand"><ReceiptMark size={15} src={initial.storeLogo} /><strong>Atelier de la Séduction</strong><span>Boutique · Abidjan</span></div>
              <div className="receipt-divider" />
              <div className="receipt-rows"><span>N° {String(receipt.invoiceId ?? receipt.id).padStart(4, '0')}</span><span>{receipt.dateLabel} · {receipt.hourLabel}</span></div>
              <div className="receipt-rows"><span>Cliente</span><strong>{receipt.customer}</strong></div>
              <div className="receipt-divider" />
              {receipt.lines.map((item) => <div className="receipt-item" key={item.id}><div><strong>{item.article}</strong><span>Réf. {item.sku}{item.size ? ` · Taille ${item.size}` : ''} · {item.quantity} × {formatMoney(item.unitPrice)}</span></div><b>{formatMoney(item.subtotal)}</b></div>)}
              <div className="receipt-divider" />
              <div className="receipt-total"><span>Total</span><strong>{formatMoney(receipt.invoiceTotal ?? receipt.total)}</strong></div>
              <div className="receipt-rows"><span>Paiement</span><strong>{receipt.method}</strong></div>
              <div className="receipt-rows"><span>Vendeuse</span><strong>{receipt.seller}</strong></div>
              <div className="receipt-divider" />
              <p className="receipt-thanks">Merci de votre visite !<span>À très vite à l’Atelier de la Séduction</span></p>
            </div>
            <div className="wa-row no-print">
              <label className="wa-field"><MessageCircle size={15} /><input placeholder="Téléphone +225 07 07 07 07 07" value={waNumber} onChange={(event) => setWaNumber(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void sendViaWhatsApp() }} /></label>
              <button className="wa-send" onClick={() => void sendViaWhatsApp()} disabled={!waNumber.trim()}><MessageCircle size={17} /> Envoyer via WhatsApp</button>
            </div>
            <div className="receipt-actions no-print">
              <button className="outline-button" onClick={downloadReceiptPdf}><Download size={16} /> PDF</button>
              <button className="outline-button" onClick={() => window.print()}><Printer size={16} /> Imprimer</button>
              <button className="primary-button" onClick={() => setReceipt(null)}><Check size={16} /> Terminé</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'import' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="sale-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="eyebrow">CATALOGUE</span><h2>Importer des produits</h2><p style={{ margin: 0, color: '#8b8183', fontSize: 12 }}>Créez plusieurs articles d’un coup depuis un CSV</p></div><button className="icon-button" onClick={() => setModal(null)}><X size={19} /></button></div>
            <button className="text-button" onClick={downloadTemplate}><Download size={15} /> Télécharger le modèle CSV</button>
            <label className="photo-upload" style={{ marginTop: 14 }}><Upload size={20} /><span>{importFile ? importFile.name : 'Choisir un fichier CSV'}</span><small>{importFile ? `${importPreview?.rows ?? 0} produits détectés` : 'Format : Référence;Nom;Catégorie;Prix;Stock;Seuil min.'}</small><input type="file" accept=".csv,.txt,text/csv" onChange={(event) => { handleImportFile(event.target.files?.[0] ?? null); event.target.value = '' }} /></label>
            {importPreview && <div className="import-preview"><div className="import-preview-head"><strong>Aperçu</strong><span>{importPreview.rows} produit(s) détecté(s)</span></div><div className="import-sample">{importPreview.sample.map((row, index) => <code key={index}>{row.join(' · ')}</code>)}</div></div>}
            {importResult && <div className="import-result"><Check size={16} /><strong>{importResult.imported} produit(s) importé(s)</strong>{importResult.skipped > 0 && <span className="import-warn">{importResult.skipped} ignoré(s)</span>}</div>}
            {importResult && importResult.errors.length > 0 && <div className="import-errors">{importResult.errors.slice(0, 6).map((message, index) => <p key={index}>{message}</p>)}{importResult.errors.length > 6 && <p>… et {importResult.errors.length - 6} autres.</p>}</div>}
            <button className="primary-button full" style={{ marginTop: 16 }} onClick={submitImport} disabled={!importFile || importBusy}><Upload size={17} /> {importBusy ? 'Import en cours…' : 'Importer les produits'}</button>
          </div>
        </div>
      )}

      {openMenuId !== null && <div className="menu-overlay" onClick={() => setOpenMenuId(null)} />}
      {toast && <button className="toast" onClick={() => setToast('')}>{toast}<X size={15} /></button>}
    </main>
  )
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div> }

function Dashboard({ initial, products, onNewSale, onNavigate, userName }: { initial: InitialData; products: ProductDTO[]; onNewSale: () => void; onNavigate: (section: Section) => void; userName: string }) {
  const { stats, chart } = initial
  const maxChart = Math.max(...chart.map((point) => point.total), 1)
  const revenueTrend = stats.revenueDelta >= 0
  const salesTrend = stats.salesTodayDelta >= 0
  const stockWatch = stats.lowStockCount > 0
  const lowStock = products.filter((product) => product.stock <= product.min)
  return (
    <>
      <PageHeading eyebrow={initial.todayLabel} title={`Bonjour ${userName.split(' ')[0]},`} description="Voici ce qui se passe dans votre boutique aujourd’hui." action={<button className="primary-button" onClick={onNewSale}><Plus size={17} /> Nouvelle vente</button>} />
      <div className="stat-grid">
        <StatCard label="Chiffre d’affaires" value={formatMoney(stats.revenueMonth)} detail={`${revenueTrend ? '+' : ''}${stats.revenueDelta}% vs. mois dernier`} trend={revenueTrend ? 'up' : 'down'} icon={<CircleDollarSign />} />
        <StatCard label="Ventes du jour" value={`${stats.salesToday}`} detail={`${salesTrend ? '+' : ''}${stats.salesTodayDelta} vs. hier`} trend={salesTrend ? 'up' : 'down'} icon={<ShoppingBag />} />
        <StatCard label="Panier moyen" value={formatMoney(stats.avgBasket)} detail={`+${stats.avgBasketDelta}% vs. mois dernier`} trend="up" icon={<TrendingUp />} />
        <StatCard label="Produits en stock" value={`${stats.totalStock}`} detail={`${stats.lowStockCount} références à surveiller`} trend={stockWatch ? 'down' : 'up'} icon={<Boxes />} />
      </div>
      <div className="dashboard-grid">
        <section className="panel revenue-panel">
          <div className="panel-heading"><div><h2>Chiffre d’affaires</h2><p>Évolution des ventes sur les 7 derniers jours</p></div><select className="period-select"><option>Cette semaine</option><option>Ce mois</option></select></div>
          <div className="chart-area">
            <div className="chart-y"><span>{formatCompact(maxChart)}</span><span>{formatCompact(Math.round(maxChart * 0.75))}</span><span>{formatCompact(Math.round(maxChart * 0.5))}</span><span>{formatCompact(Math.round(maxChart * 0.25))}</span><span>0</span></div>
            <div className="chart"><div className="grid-lines"><i /><i /><i /><i /><i /></div><div className="bars">{chart.map((point, index) => <div className="bar-wrap" key={point.day}><div className="bar" style={{ height: `${Math.max(4, Math.round((point.total / maxChart) * 100))}%`, background: point.total === maxChart ? 'var(--primary)' : undefined }} /><span>{point.day}</span></div>)}</div></div>
          </div>
        </section>
        <section className="panel stock-panel">
          <div className="panel-heading"><div><h2>Stock à surveiller</h2><p>Références sous le seuil minimum</p></div><button className="text-button" onClick={() => onNavigate('stock')}>Voir tout <ArrowUpRight size={15} /></button></div>
          {lowStock.length === 0 ? <p className="empty-note" style={{ padding: '16px 4px 4px' }}>Aucune référence sous le seuil — stock sain. ✨</p> : <div className="stock-list">{lowStock.slice(0, 3).map((product) => <div className="stock-row" key={product.id}><div className={`product-thumb ${product.color}`}>{product.image ? <img src={product.image} alt={product.name} /> : product.initials}</div><div className="stock-info"><strong>{product.name}</strong><span>{product.stock} unités en stock</span></div><div className="stock-status"><b className="danger-text">{product.stock} / {product.min}</b><span>Seuil min. {product.min}</span></div></div>)}</div>}
        </section>
      </div>
    </>
  )
}

function StatCard({ label, value, detail, trend, icon }: { label: string; value: string; detail: string; trend: 'up' | 'down'; icon: React.ReactNode }) { return <div className="stat-card"><div className="stat-icon">{icon}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className={`stat-detail ${trend}`}>{trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{detail}</span></div> }

function ActivityRows({ sales, onReceipt, onRefund, canRefund }: { sales: InitialData['sales']; onReceipt: (sale: InitialData['sales'][number]) => void; onRefund: (sale: InitialData['sales'][number]) => void; canRefund: boolean }) {
  return <div className="activity-table"><div className="table-row table-head"><span>CLIENTE</span><span>ARTICLE</span><span>VENDEUSE</span><span>MONTANT</span><span>MOYEN</span><span>DATE & HEURE</span><span>REÇU</span><span>STATUT</span></div>{sales.map((row) => <div className="table-row" key={row.id}><span><span className="row-avatar">{String(row.customer).split(' ').slice(0, 2).map((word) => word[0]).join('')}</span>{row.customer}</span><span>{row.article}{row.size ? <span className="article-size"> · {row.size}</span> : null}</span><span>{row.seller || '—'}</span><span className="money">{formatMoney(row.total)}</span><span>{row.method}</span><span className="muted-cell">{row.dateLabel} · {row.time}</span><span><button className="receipt-button" aria-label={`Reçu de la vente ${row.id}`} onClick={() => onReceipt(row)} disabled={row.refunded}><ReceiptText size={16} /></button></span><span>{row.refunded ? <span className="status-pill danger-soft">Remboursée</span> : canRefund ? <button className="refund-button" title="Rembourser cette vente" onClick={() => onRefund(row)}><RotateCcw size={15} /></button> : <span className="status-pill good-soft">Payée</span>}</span></div>)}</div>
}

function Products({ allProducts, products, categories, currentCategory, onCategoryChange, onAdd, onEdit, onArchive, onRequestDelete, onImport, onExport, showArchived, onToggleArchived, openMenuId, onMenuToggle, canManage }: { allProducts: ProductDTO[]; products: ProductDTO[]; categories: string[]; currentCategory: string; onCategoryChange: (category: string) => void; onAdd: () => void; onEdit: (product: ProductDTO) => void; onArchive: (product: ProductDTO) => void; onRequestDelete: (product: ProductDTO) => void; onImport: () => void; onExport: (format: 'csv' | 'pdf') => void; showArchived: boolean; onToggleArchived: () => void; openMenuId: number | null; onMenuToggle: (id: number | null) => void; canManage: boolean }) {
  const countOf = (category: string) => allProducts.filter((p) => p.category === category).length
  return <><PageHeading eyebrow="CATALOGUE" title="Produits" description="Gérez vos références, variantes et prix de vente." action={canManage && <button className="primary-button" onClick={onAdd}><Plus size={17} /> Ajouter un produit</button>} /><div className="toolbar"><div className="filter-tabs"><button className={currentCategory === 'all' ? 'selected' : ''} onClick={() => onCategoryChange('all')}>Tous les produits <b>{allProducts.length}</b></button>{categories.map((category) => <button key={category} className={currentCategory === category ? 'selected' : ''} onClick={() => onCategoryChange(category)}>{category} <b>{countOf(category)}</b></button>)}</div><div className="toolbar-right">{canManage && <><button className="outline-button" onClick={onImport}><Upload size={16} /> Importer</button><button className="outline-button" onClick={() => onExport('csv')}><Download size={16} /> CSV</button><button className="outline-button" onClick={() => onExport('pdf')}><FileText size={16} /> PDF</button></>}<label className="archived-toggle"><input type="checkbox" checked={showArchived} onChange={onToggleArchived} /> Afficher les archivés</label></div></div><section className="panel products-panel"><div className="product-grid">{products.map((product) => <div className={`product-card ${product.active ? '' : 'archived'}`} key={product.id}><div className={`product-visual ${product.color}`}>{product.image ? <img className="product-photo" src={product.image} alt={product.name} /> : <span>{product.initials}</span>}{canManage && <button className={`options-btn ${openMenuId === product.id ? 'open' : ''}`} aria-label={`Options ${product.name}`} onClick={() => onMenuToggle(openMenuId === product.id ? null : product.id)}><MoreHorizontal size={16} /></button>}{canManage && openMenuId === product.id && <div className="product-menu"><button onClick={() => onEdit(product)}><Pencil size={14} /> Modifier</button><button className={product.active ? '' : 'reactivate-item'} onClick={() => onArchive(product)}>{product.active ? <><Archive size={14} /> Archiver</> : <><RotateCcw size={14} /> Réactiver</>}</button><button className="delete-item" onClick={() => onRequestDelete(product)}><Trash2 size={14} /> Supprimer</button></div>}</div><div className="product-card-body"><div>{product.active ? <span className="category-tag">{product.category}</span> : <span className="archived-tag">Archivé</span>}<h3>{product.name}</h3><p>{product.sku}</p></div><strong>{formatMoney(product.price)}</strong><div className="product-meta"><span className={product.stock <= product.min ? 'danger-text' : 'success-text'}><i /> {product.stock} en stock</span><span>Prix unitaire</span></div>{product.sizes ? <div className="card-sizes">{Object.entries(product.sizes).map(([size, qty]) => <span key={size} className={qty <= 0 ? 'card-size card-size-empty' : 'card-size'}>{size}<b>{qty}</b></span>)}</div> : null}</div></div>)}</div></section></>
}

function Sales({ initial, onNewSale, onExport, onReceipt, onRefund, canRefund }: { initial: InitialData; onNewSale: () => void; onExport: (filters: { period: 'today' | 'week' | 'month' | 'all'; type: 'sales' | 'refunds' | 'all'; seller: string }, format: 'csv' | 'pdf') => void; onReceipt: (sale: InitialData['sales'][number]) => void; onRefund: (sale: InitialData['sales'][number]) => void; canRefund: boolean }) {
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('month')
  const [type, setType] = useState<'sales' | 'refunds' | 'all'>('all')
  const [seller, setSeller] = useState('all')

  const sellers = useMemo(() => [...new Set(initial.sales.map((sale) => sale.seller).filter((name) => name.length > 0))].sort((a, b) => a.localeCompare(b, 'fr')), [initial.sales])

  const filtered = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const week = new Date(today)
    week.setDate(week.getDate() - 6)
    const month = new Date(now.getFullYear(), now.getMonth(), 1)
    return initial.sales.filter((sale) => {
      const d = new Date(sale.soldAt)
      if (period === 'today' && d < today) return false
      if (period === 'week' && d < week) return false
      if (period === 'month' && d < month) return false
      if (type === 'sales' && sale.refunded) return false
      if (type === 'refunds' && !sale.refunded) return false
      if (seller !== 'all' && sale.seller !== seller) return false
      return true
    })
  }, [initial.sales, period, type, seller])

  const revenue = filtered.reduce((sum, sale) => sum + (sale.refunded ? 0 : sale.total), 0)
  const refundedTotal = filtered.reduce((sum, sale) => sum + (sale.refunded ? sale.total : 0), 0)

  const periodLabel = period === 'today' ? "d'aujourd'hui" : period === 'week' ? 'des 7 derniers jours' : period === 'month' ? 'de ce mois-ci' : 'de toutes les périodes'

  return <><PageHeading eyebrow="ACTIVITÉ COMMERCIALE" title="Ventes & caisse" description="Retrouvez et enregistrez toutes les ventes de la boutique." action={<button className="primary-button" onClick={onNewSale}><Plus size={17} /> Nouvelle vente</button>} /><div className="mini-stat-row"><StatCard label="Aujourd’hui" value={`${initial.stats.salesToday} ventes`} detail={`${initial.stats.salesTodayDelta >= 0 ? '+' : ''}${initial.stats.salesTodayDelta} vs. hier`} trend={initial.stats.salesTodayDelta >= 0 ? 'up' : 'down'} icon={<ShoppingBag />} /><StatCard label="Cette semaine" value={formatMoney(initial.weekRevenue)} detail={`${initial.salesThisMonth} ventes ce mois`} trend="up" icon={<CircleDollarSign />} /><StatCard label="Retours" value={`${initial.returnsCount}`} detail="Ce mois-ci — ventes annulées" trend="down" icon={<RotateCcw />} /></div><section className="panel"><div className="panel-heading"><div><h2>Historique des ventes</h2><p>{filtered.length} opération(s) {periodLabel}{seller !== 'all' ? ` · ${seller}` : ''}{type !== 'all' ? type === 'refunds' ? ' · remboursements' : ' · ventes' : ''}</p></div><div className="export-actions"><button className="outline-button" onClick={() => onExport({ period, type, seller }, 'csv')}><Download size={15} /> CSV</button><button className="outline-button" onClick={() => onExport({ period, type, seller }, 'pdf')}><FileText size={15} /> PDF</button></div></div><div className="filter-bar"><label className="filter-field"><CalendarRange size={15} /><select value={period} onChange={(event) => setPeriod(event.target.value as 'today' | 'week' | 'month' | 'all')}><option value="today">Aujourd'hui</option><option value="week">7 derniers jours</option><option value="month">Ce mois-ci</option><option value="all">Toutes les périodes</option></select></label><label className="filter-field"><RotateCcw size={15} /><select value={type} onChange={(event) => setType(event.target.value as 'sales' | 'refunds' | 'all')}><option value="all">Toutes</option><option value="sales">Ventes</option><option value="refunds">Remboursements</option></select></label><label className="filter-field"><UserRound size={15} /><select value={seller} onChange={(event) => setSeller(event.target.value)}><option value="all">Toutes les vendeuses</option>{sellers.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><div className="result-summary"><span><strong>{filtered.length}</strong> opérations</span><span className="money total-good"><strong>{formatMoney(revenue)}</strong> encaissé</span>{refundedTotal > 0 && <span className="money total-bad"><strong>{formatMoney(refundedTotal)}</strong> remboursé</span>}</div></div>{filtered.length > 0 ? <ActivityRows sales={filtered} onReceipt={onReceipt} onRefund={onRefund} canRefund={canRefund} /> : <p className="empty-note">Aucune vente ne correspond à ces filtres.</p>}</section></>
}

function CustomersSection({ initial, onAdd, onAnonymize, onExport, onNewSale }: {
  initial: InitialData
  onAdd: (input: { name: string; phone: string }) => Promise<{ ok: boolean; error?: string }>
  onAnonymize: (customerId: number) => Promise<{ ok: boolean; error?: string }>
  onExport: (kind: 'customers', label: string, filters?: undefined, format?: 'csv' | 'pdf') => void
  onNewSale: () => void
}) {
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const customers = initial.customers
  const filtered = customers.filter((client) => `${client.name} ${client.phone}`.toLowerCase().includes(query.toLowerCase()))
  const sorted = [...filtered].sort((a, b) => b.totalSpent - a.totalSpent)
  const top = [...customers].sort((a, b) => b.totalSpent - a.totalSpent)[0]
  const trackedRevenue = customers.reduce((sum, client) => sum + client.totalSpent, 0)
  const totalVisits = customers.reduce((sum, client) => sum + client.visits, 0)

  const submitAdd = async () => {
    setError(null)
    const name = form.name.trim()
    if (!name) return setError('Saisissez le nom de la cliente.')
    setBusy(true)
    const result = await onAdd({ name, phone: form.phone.trim() })
    setBusy(false)
    if (!result.ok) return setError(result.error ?? 'Une erreur est survenue.')
    setAddOpen(false)
    setForm({ name: '', phone: '' })
  }

  const anonymize = async (client: { id: number; name: string }) => {
    const ok = window.confirm(`Effacer les données personnelles de ${client.name} ?\n\nLe nom et le téléphone seront remplacés par « Cliente anonymisée », y compris dans l’historique des ventes. Les statistiques (passages, montants) sont conservées.`)
    if (!ok) return
    setBusyId(client.id)
    const result = await onAnonymize(client.id)
    setBusyId(null)
    if (!result.ok) return setError(result.error ?? 'Une erreur est survenue.')
  }

  return (
    <>
      <PageHeading eyebrow="RELATION CLIENT" title="Clientes & répertoire" description="Constituez votre fichier clients et suivez leur fidélité." action={<button className="primary-button" onClick={() => { setAddOpen((value) => !value); setError(null) }}><UserPlus size={17} /> Ajouter une cliente</button>} />
      <p className="rgpd-note"><ShieldCheck size={13} /> Données stockées pour la gestion de la boutique — chaque cliente peut demander l’effacement de ses informations personnelles (RGPD).</p>
      <div className="mini-stat-row"><StatCard label="Clientes au répertoire" value={`${customers.length}`} detail={`${totalVisits} passages cumulés`} trend={customers.length > 0 ? 'up' : 'down'} icon={<UsersRound />} /><StatCard label="CA généré par les clientes" value={formatMoney(trackedRevenue)} detail="Total dépensé — toutes ventes liées" trend="up" icon={<CircleDollarSign />} /><StatCard label={top ? 'Meilleure cliente' : 'En attente'} value={top ? top.name.split(' ')[0] : '—'} detail={top ? `${top.visits} passage(s) · ${formatMoney(top.totalSpent)}` : 'Enregistrez une première vente liée à une cliente'} trend="up" icon={<Heart />} /></div>
      {addOpen && <div className="invite-card"><h3>Nouvelle cliente</h3><div className="invite-fields">
        <label className="form-label">Nom complet <input placeholder="Ex : Mariam Cissé" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus /></label>
        <label className="form-label">Téléphone <input placeholder="Ex : 07 07 07 07 07" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
      </div>{error && <p className="form-error">{error}</p>}<div className="invite-actions"><button className="primary-button" onClick={() => void submitAdd()} disabled={busy}><UserPlus size={16} /> {busy ? 'Enregistrement…' : 'Ajouter au répertoire'}</button><button className="outline-button" onClick={() => setAddOpen(false)}>Annuler</button></div></div>}
      <section className="panel">
        <div className="panel-heading"><div><h2>Répertoire des clientes</h2><p>{filtered.length} cliente(s) {query ? `— recherche « ${query} »` : ''}</p></div><div className="table-actions"><div className="export-actions"><button className="outline-button" onClick={() => onExport('customers', 'Clientes')}><Download size={15} /> CSV</button><button className="outline-button" onClick={() => onExport('customers', 'Clientes', undefined, 'pdf')}><FileText size={15} /> PDF</button></div></div></div>
        <div className="search-box"><Search size={15} /><input placeholder="Rechercher par nom ou téléphone…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {customers.length > 0 ? (
          <div className="customer-table">
            <div className="table-row table-head"><span>CLIENTE</span><span>TÉLÉPHONE</span><span>PASSAGES</span><span>TOTAL DÉPENSÉ</span><span>DERNIÈRE VISITE</span><span /></div>
            {sorted.length > 0 ? sorted.map((client) => (
              <div className="table-row" key={client.id}>
                <span><span className={`row-avatar ${client.visits >= 2 ? 'vip' : ''}`}>{client.initials}</span><strong>{client.name}</strong>{client.visits >= 2 && <span className="status-pill good-soft">Habituée</span>}</span>
                <span className="muted-cell">{client.phone ? client.phone : '—'}</span>
                <span>{client.visits}</span>
                <span className="money">{formatMoney(client.totalSpent)}</span>
                <span className="muted-cell">{client.lastVisitLabel}</span>
                <span className="row-actions">{client.phone ? <a className="call-link" href={`tel:${client.phone.replaceAll(' ', '')}`} title={`Appeler ${client.name}`}><Phone size={15} /></a> : null}{client.name !== 'Cliente anonymisée' && <button className="action-btn" title="Effacer les données personnelles (RGPD)" disabled={busyId === client.id} onClick={() => void anonymize(client)}><UserX size={15} /></button>}</span>
              </div>
            )) : <p className="empty-note">Aucune cliente ne correspond à la recherche.</p>}
          </div>
        ) : (
          <div className="empty-cta"><Heart size={22} /><p>Aucune cliente au répertoire pour le moment.</p><div><button className="outline-button" onClick={() => { setAddOpen(true); setError(null) }}><UserPlus size={16} /> Ajouter une cliente</button><button className="primary-button" onClick={onNewSale}><ShoppingBag size={16} /> Nouvelle vente</button></div></div>
        )}
      </section>
    </>
  )
}

function Stock({ products, valueCost, valueRetail, onAdjust, canAdjust }: { products: ProductDTO[]; valueCost: number; valueRetail: number; onAdjust: () => void; canAdjust: boolean }) {
  const [alertsOnly, setAlertsOnly] = useState(false)
  const low = products.filter((product) => product.stock <= product.min)
  const shown = alertsOnly ? low : products
  const marginPotential = valueRetail - valueCost
  return <><PageHeading eyebrow="INVENTAIRE" title="Gestion du stock" description="Suivez les niveaux, mouvements et alertes de votre inventaire." action={canAdjust && <button className="primary-button" onClick={onAdjust}><Plus size={17} /> Ajuster le stock</button>} /><div className="mini-stat-row three"><StatCard label="Valeur du stock (au coût)" value={formatMoney(valueCost)} detail="Inventaire valorisé au prix d’achat" trend="up" icon={<Boxes />} /><StatCard label="Valeur du stock (au prix de vente)" value={formatMoney(valueRetail)} detail="Ce que rapporterait la vente totale" trend="up" icon={<Tag />} /><StatCard label="Marge potentielle" value={formatMoney(marginPotential)} detail={`${valueRetail > 0 ? Math.round((marginPotential / valueRetail) * 100) : 0}% du potentiel de vente`} trend={marginPotential >= 0 ? 'up' : 'down'} icon={<TrendingUp />} /></div><div className="alert-banner"><AlertTriangle size={19} /><div><strong>{low.length} références nécessitent votre attention</strong><span>Pensez à réapprovisionner les produits sous leur seuil minimum.</span></div><button className="text-button" onClick={() => setAlertsOnly((value) => !value)}>{alertsOnly ? 'Voir tout' : 'Voir les alertes'}</button></div><section className="panel"><div className="panel-heading"><div><h2>État des stocks</h2><p>{shown.length} références {alertsOnly ? 'en alerte' : 'au catalogue'}</p></div><div className="table-actions"><Search size={16} /><span>Filtrer</span></div></div><div className="stock-table"><div className="table-row table-head"><span>PRODUIT</span><span>CATÉGORIE</span><span>STOCK ACTUEL</span><span>TAILLES</span><span>SEUIL MIN.</span><span>ÉTAT</span></div>{shown.map((product) => <div className="table-row" key={product.id}><span><span className={`product-thumb small ${product.color}`}>{product.image ? <img src={product.image} alt={product.name} /> : product.initials}</span><strong>{product.name}</strong></span><span>{product.category}</span><span className="bold-cell">{product.stock} unités</span><span className="muted-cell">{product.sizes ? Object.entries(product.sizes).map(([size, qty]) => <span className="size-cell" key={size}>{size}<b>{qty}</b></span>) : '—'}</span><span>{product.min} unités</span><span><span className={product.stock <= product.min ? 'status-pill warning' : 'status-pill good'}>{product.stock <= product.min ? 'À réapprovisionner' : 'En stock'}</span></span></div>)}</div></section></>
}

function Expenses({ initial, onAdd, onExport }: { initial: InitialData; onAdd: () => void; onExport: (format: 'csv' | 'pdf') => void }) {
  const margin = initial.stats.revenueMonth - initial.expensesMonth
  return <><PageHeading eyebrow="FINANCES" title="Dépenses" description="Suivez les charges et dépenses de la boutique." action={<button className="primary-button" onClick={onAdd}><Plus size={17} /> Nouvelle dépense</button>} /><div className="stat-grid two"><StatCard label="Dépenses ce mois" value={formatMoney(initial.expensesMonth)} detail={`${initial.expenses.length} dépenses enregistrées`} trend="up" icon={<FileText />} /><StatCard label="Marge brute mensuelle" value={formatMoney(margin)} detail="CA − dépenses du mois" trend={margin >= 0 ? 'up' : 'down'} icon={<TrendingUp />} /></div><section className="panel"><div className="panel-heading"><div><h2>Dernières dépenses</h2><p>Suivi des charges</p></div><div className="export-actions"><button className="outline-button" onClick={() => onExport('csv')}><Download size={15} /> CSV</button><button className="outline-button" onClick={() => onExport('pdf')}><FileText size={15} /> PDF</button></div></div><div className="expense-list">{initial.expenses.map((item) => <div className="expense-row" key={item.id}><div className="expense-icon"><FileText size={17} /></div><div><strong>{item.label}</strong><span>{item.category}</span></div><b>{formatMoney(item.amount)}</b><span>{item.dateLabel}</span></div>)}</div></section></>
}

function Reports({ initial, onExport }: { initial: InitialData; onExport: (format: 'csv' | 'pdf') => void }) {
  const { categories } = initial
  const total = categories.reduce((sum, category) => sum + category.total, 0)
  const p1 = categories[0]?.pct ?? 0
  const p2 = p1 + (categories[1]?.pct ?? 0)
  const gradient = `conic-gradient(var(--primary) 0 ${p1}%, var(--rose) ${p1}% ${p2}%, var(--gold) ${p2}% 100%)`
  const donutMiddle = total >= 1000000 ? formatCompact(total) + 'M' : formatCompact(total)
  const { stats } = initial
  const net = stats.marginMonth - initial.expensesMonth
  return <><PageHeading eyebrow="ANALYSE" title="Rapports" description="Pilotez la performance de l’Atelier de la Séduction en un coup d’œil." action={<div className="export-actions"><button className="outline-button" onClick={() => onExport('csv')}><Download size={15} /> CSV</button><button className="outline-button" onClick={() => onExport('pdf')}><FileText size={15} /> PDF</button></div>} /><div className="mini-stat-row four"><StatCard label="CA du mois" value={formatMoney(stats.revenueMonth)} detail={`${initial.salesThisMonth} ventes`} trend="up" icon={<CircleDollarSign />} /><StatCard label="Coût des ventes" value={formatMoney(stats.costOfGoodsMonth)} detail="Au prix d’achat des articles vendus" trend="down" icon={<Tag />} /><StatCard label="Marge brute (coût)" value={formatMoney(stats.marginMonth)} detail={`${stats.revenueMonth > 0 ? Math.round((stats.marginMonth / stats.revenueMonth) * 100) : 0}% du CA`} trend={stats.marginMonth >= 0 ? 'up' : 'down'} icon={<TrendingUp />} /><StatCard label="Résultat net du mois" value={formatMoney(net)} detail="Marge − dépenses du mois" trend={net >= 0 ? 'up' : 'down'} icon={<Wallet />} /></div><div className="report-grid"><div className="panel report-card"><span>Ventes par catégorie</span><div className="donut" style={{ background: gradient }}><strong>{donutMiddle}</strong><small>CA total</small></div><div className="legend">{categories.map((category, index) => <span key={category.name}><i className={`dot ${index === 0 ? 'rose-dot' : index === 1 ? 'plum-dot' : 'gold-dot'}`} /> {category.name} <b>{category.pct}%</b></span>)}</div></div><div className="panel report-card"><span>Références les plus vendues</span>{initial.topProducts.map((product, index) => <div className="ranking" key={product.name}><b>0{index + 1}</b><span>{product.name}</span><strong>{product.count} ventes</strong></div>)}</div></div></>
}

type UserActionResult = { ok: boolean; error?: string; tempPassword?: string }

function UsersSection({ users, currentEmail, onInvite, onUpdateRole, onUpdateStatus, onReset }: {
  users: InitialData['users']
  currentEmail: string
  onInvite: (input: { name: string; email: string; role: string }) => Promise<UserActionResult>
  onUpdateRole: (userId: number, role: string) => Promise<UserActionResult>
  onUpdateStatus: (userId: number, status: 'Actif' | 'Suspendu') => Promise<UserActionResult>
  onReset: (userId: number) => Promise<UserActionResult>
}) {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'Caissière' })
  const [inviteBusy, setInviteBusy] = useState(false)
  const [secret, setSecret] = useState<{ title: string; password: string } | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submitInvite = async () => {
    setError(null)
    const name = inviteForm.name.trim()
    const email = inviteForm.email.trim()
    if (!name) return setError('Saisissez le nom complet.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Adresse e-mail invalide.')
    setInviteBusy(true)
    const result = await onInvite({ name, email, role: inviteForm.role })
    setInviteBusy(false)
    if (!result.ok) return setError(result.error ?? 'Une erreur est survenue.')
    setSecret({ title: `Accès créé pour ${name}`, password: result.tempPassword ?? '' })
    setInviteOpen(false)
    setInviteForm({ name: '', email: '', role: 'Caissière' })
  }

  const copySecret = async () => {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret.password)
    } catch {
      /* presse-papiers indisponible */
    }
  }

  const changeRole = async (user: InitialData['users'][number], role: string) => {
    if (!role || role === user.role) return
    setBusyId(user.id)
    const result = await onUpdateRole(user.id, role)
    setBusyId(null)
    if (!result.ok) setError(result.error ?? 'Une erreur est survenue.')
  }

  const toggleStatus = async (user: InitialData['users'][number]) => {
    const next: 'Actif' | 'Suspendu' = user.status === 'Actif' ? 'Suspendu' : 'Actif'
    if (!(next === 'Suspendu' ? window.confirm(`Suspendre l’accès de ${user.name} ? La personne ne pourra plus se connecter.`) : true)) return
    setBusyId(user.id)
    const result = await onUpdateStatus(user.id, next)
    setBusyId(null)
    if (!result.ok) setError(result.error ?? 'Une erreur est survenue.')
  }

  const resetFor = async (user: InitialData['users'][number]) => {
    if (!window.confirm(`Réinitialiser le mot de passe de ${user.name} ?`)) return
    setBusyId(user.id)
    const result = await onReset(user.id)
    setBusyId(null)
    if (!result.ok) return setError(result.error ?? 'Une erreur est survenue.')
    setSecret({ title: `Mot de passe réinitialisé pour ${user.name}`, password: result.tempPassword ?? '' })
  }

  return (
    <>
      <PageHeading eyebrow="ÉQUIPE" title="Utilisateurs" description="Gérez les accès à votre espace de gestion." action={<button className="primary-button" onClick={() => { setInviteOpen((value) => !value); setSecret(null); setError(null) }}><Plus size={17} /> Inviter un utilisateur</button>} />
      {inviteOpen && <div className="invite-card"><h3>Nouvel accès à la boutique</h3><div className="invite-fields">
        <label className="form-label">Nom complet<input placeholder="Ex : Aminata Koné" value={inviteForm.name} onChange={(event) => setInviteForm({ ...inviteForm, name: event.target.value })} /></label>
        <label className="form-label">Adresse e-mail<input type="email" placeholder="prenom@exemple.ci" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} /></label>
        <label className="form-label">Rôle<select value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}>{USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
      </div>{error && <p className="form-error">{error}</p>}<div className="invite-actions"><button className="primary-button" onClick={() => void submitInvite()} disabled={inviteBusy}><Plus size={16} /> {inviteBusy ? 'Création…' : 'Créer l’accès'}</button><button className="outline-button" onClick={() => setInviteOpen(false)}>Annuler</button></div></div>}
      {secret && <div className="secret-box"><KeyRound size={19} /><div><strong>{secret.title}</strong><span>Mot de passe temporaire à transmettre :</span></div><code>{secret.password}</code><button onClick={() => void copySecret()}><Copy size={14} /> Copier</button><button onClick={() => setSecret(null)}><X size={14} /> Fermer</button></div>}
      <section className="panel"><div className="panel-heading"><div><h2>Membres de l’équipe</h2><p>{users.length} compte(s)</p></div></div>{users.map((user) => {
        const isSelf = user.email === currentEmail
        const locked = busyId === user.id || isSelf
        return <div className="user-row" key={user.id}><div className="avatar">{user.initials}</div><div className="user-id"><strong>{user.name}{isSelf && <em className="self-tag"> (vous)</em>}</strong><span>{user.email}</span></div><select className="role-select" value={user.role} disabled={locked || user.status !== 'Actif'} onChange={(event) => void changeRole(user, event.target.value)} aria-label={`Rôle de ${user.name}`}>{USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select><span className={`status-pill ${user.status === 'Actif' ? 'good' : 'danger'}`}>{user.status}</span><div className="user-actions"><button className="action-btn" title={isSelf ? 'Votre propre compte' : 'Réinitialiser le mot de passe'} disabled={locked} onClick={() => void resetFor(user)}><KeyRound size={16} /></button><button className={`action-btn ${user.status === 'Actif' ? 'danger' : ''}`} title={isSelf ? 'Votre propre compte' : user.status === 'Actif' ? 'Suspendre cet accès' : 'Réactiver cet accès'} disabled={locked} onClick={() => void toggleStatus(user)}>{user.status === 'Actif' ? <Ban size={16} /> : <Power size={16} />}</button></div></div>
      })}</section>
    </>
  )
}

const ACTIVITY_ICONS: Record<string, typeof FileText> = {
  Vente: ShoppingBag,
  Remboursement: RotateCcw,
  'Ajout produit': Package,
  'Modification produit': Pencil,
  'Archivage produit': Archive,
  'Réactivation produit': Boxes,
  'Suppression produit': Trash2,
  'Ajustement stock': Boxes,
  Dépense: FileText,
  'Import catalogue': Upload,
  'Export ventes': Download,
  'Export catalogue': Download,
  'Export dépenses': Download,
  'Export rapport': Download,
  Invitation: KeyRound,
  'Changement de rôle': Users,
  'Suspension compte': Ban,
  'Réactivation compte': Power,
  'Réinitialisation mot de passe': KeyRound,
}

function JournalSection({ activity }: { activity: InitialData['activity'] }) {
  return (
    <>
      <PageHeading eyebrow="TRAÇABILITÉ" title="Journal d’activité" description="Chaque action sensible de la boutique est enregistrée avec son auteur et son horodatage." />
      <section className="panel">
        {activity.length > 0 ? (
          <div className="activity-log">{activity.map((entry) => {
            const Icon = ACTIVITY_ICONS[entry.type] ?? FileText
            return <div className="log-row" key={entry.id}><span className="log-icon"><Icon size={16} /></span><div className="log-body"><strong>{entry.type}</strong><span>{entry.detail}</span></div><span className="log-meta"><b>{entry.userName}</b><span>{entry.timeLabel}</span></span></div>
          })}</div>
        ) : <p className="empty-note">Aucune activité enregistrée pour le moment.</p>}
      </section>
    </>
  )
}
function SettingsSection({ logo, busy, onPick, onClear }: { logo: string | null; busy: boolean; onPick: (file?: File | null) => void; onClear: () => void }) {
  return (
    <>
      <PageHeading eyebrow="BOUTIQUE" title="Paramètres" description="Personnalisez les éléments communs aux reçus, exports PDF et à la page de connexion." />
      <section className="panel settings-panel">
        <div className="panel-heading"><div><h2>Logo de la boutique</h2><p>Apparaît en tête du reçu (PDF et impression), des exports PDF et de l’écran de connexion.</p></div></div>
        <div className="settings-logo-row">
          <div className="logo-preview">{logo ? <img src={logo} alt="Logo personnalisé actuel" /> : <AppLogo size={54} />}</div>
          <div className="settings-logo-actions">
            <p>{logo ? 'Un logo personnalisé est actif.' : 'Aucun logo personnalisé : le logo par défaut est utilisé.'}</p>
            <div className="settings-logo-buttons">
              <label className="primary-button logo-upload-label"><ImagePlus size={16} /> {busy ? 'Traitement…' : 'Importer un logo'}<input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={(event) => { onPick(event.target.files?.[0]); event.target.value = '' }} /></label>
              {logo && <button className="outline-button" onClick={onClear} disabled={busy}><RotateCcw size={15} /> Revenir au logo par défaut</button>}
            </div>
            <small>PNG ou JPG · 2 Mo maximum · redimensionné à 256 px en conservant les proportions.</small>
          </div>
        </div>
      </section>
    </>
  )
}