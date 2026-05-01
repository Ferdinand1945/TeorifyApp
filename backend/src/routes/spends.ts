import { Router } from 'express'
import { z } from 'zod'
import mongoose from 'mongoose'

import { requireUser } from '../middleware/requireUser.js'
import { CategoryModel } from '../models/Category.js'
import { SpendModel } from '../models/Spend.js'
import { scanReceiptFromBase64, scanReceiptFromText } from '../receipt/scanReceipt.js'
import { PDFParse } from 'pdf-parse'
import crypto from 'crypto'
import path from 'path'
import { promises as fs } from 'fs'
import { getActiveScopeForUser } from '../scope/activeScope.js'

// `pdf-parse` ESM build doesn't expose a default export in this setup.
const pdfParse = PDFParse as unknown as (data: Buffer) => Promise<{ text?: string }>

const router = Router()

const optionalDate = () =>
  z.preprocess((v) => {
    if (v === null || v === undefined) return undefined
    if (typeof v === 'string' && v.trim() === '') return undefined
    return v
  }, z.coerce.date().optional())

const createSchema = z.object({
  title: z.string().min(1).max(160),
  type: z.enum(['expense', 'income']).default('expense'),
  amountCents: z.number().int().min(0),
  currency: z.string().min(3).max(3),
  occurredAt: optionalDate(),
  renewalAt: optionalDate().nullable().optional(),
  categoryId: z.string().min(1).optional().nullable(),
  serviceKey: z.string().min(1).max(40).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  attachments: z
    .array(
      z.object({
        id: z.string().min(1),
        url: z.string().min(1),
        mimeType: z.string().min(1),
        fileName: z.string().optional().nullable(),
        kind: z.enum(['receipt', 'document', 'image']).optional().nullable(),
        sizeBytes: z.number().int().nonnegative().optional().nullable(),
        createdAt: z.coerce.date(),
      }),
    )
    .optional(),
})

const updateSchema = createSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field must be provided' })

const receiptScanSchema = z.object({
  imageBase64: z.string().min(50),
  mimeType: z.string().optional().nullable(),
})

const scanAttachmentSchema = z.object({
  base64: z.string().min(50),
  mimeType: z.string().min(3),
})

const uploadAttachmentSchema = z.object({
  base64: z.string().min(50),
  mimeType: z.string().min(3),
  fileName: z.string().max(200).optional().nullable(),
  kind: z.enum(['receipt', 'document', 'image']).optional().nullable(),
  sizeBytes: z.number().int().nonnegative().optional().nullable(),
})

router.use(requireUser)

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')

  const from = req.query.from ? new Date(String(req.query.from)) : null
  const to = req.query.to ? new Date(String(req.query.to)) : null
  const scope = await getActiveScopeForUser(req.userId!)
  const filter: Record<string, unknown> = { userId: req.userId, householdId: scope.householdId ?? null }

  if (from || to) {
    filter.occurredAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    }
  }

  const items = await SpendModel.find(filter).sort({ occurredAt: -1, createdAt: -1 }).lean()
  res.json({ items })
})

router.post('/scan-receipt', async (req, res) => {
  const data = receiptScanSchema.parse(req.body)
  const full = await scanReceiptFromBase64({ base64: data.imageBase64, mimeType: data.mimeType })
  const result = {
    title: full.title ?? null,
    amount: full.amount ?? null,
    currency: full.currency ?? null,
    occurredAt: full.occurredAt ?? null,
  }
  res.json({ result })
})

router.post('/scan-attachment', async (req, res) => {
  const data = scanAttachmentSchema.parse(req.body)

  if (data.mimeType === 'application/pdf' || data.mimeType.toLowerCase().includes('pdf')) {
    const raw = data.base64.includes('base64,') ? data.base64.split('base64,').pop() || '' : data.base64
    const buf = Buffer.from(raw, 'base64')
    const parsed = await pdfParse(buf)
    const full = scanReceiptFromText(parsed.text || '')
    const result = {
      title: full.title ?? null,
      amount: full.amount ?? null,
      currency: full.currency ?? null,
      occurredAt: full.occurredAt ?? null,
    }
    return res.json({ result })
  }

  const full = await scanReceiptFromBase64({ base64: data.base64, mimeType: data.mimeType })
  const result = {
    title: full.title ?? null,
    amount: full.amount ?? null,
    currency: full.currency ?? null,
    occurredAt: full.occurredAt ?? null,
  }
  res.json({ result })
})

router.post('/upload-attachment', async (req, res) => {
  const data = uploadAttachmentSchema.parse(req.body)

  const raw = data.base64.includes('base64,') ? data.base64.split('base64,').pop() || '' : data.base64
  const buf = Buffer.from(raw, 'base64')

  const id = crypto.randomUUID()
  const safeUser = String(req.userId).replace(/[^a-zA-Z0-9_-]/g, '_')
  const userDir = path.join(process.cwd(), 'uploads', safeUser)
  await fs.mkdir(userDir, { recursive: true })

  const ext = (() => {
    const mt = data.mimeType.toLowerCase()
    if (mt.includes('pdf')) return 'pdf'
    if (mt.includes('png')) return 'png'
    if (mt.includes('webp')) return 'webp'
    if (mt.includes('heic')) return 'heic'
    return 'jpg'
  })()

  const filePath = path.join(userDir, `${id}.${ext}`)
  await fs.writeFile(filePath, buf)

  const attachment = {
    id,
    url: `/uploads/${safeUser}/${id}.${ext}`,
    mimeType: data.mimeType,
    fileName: data.fileName ?? null,
    kind: data.kind ?? null,
    sizeBytes: data.sizeBytes ?? buf.byteLength,
    createdAt: new Date(),
  }

  res.status(201).json({ attachment })
})

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body)
  const scope = await getActiveScopeForUser(req.userId!)

  if (data.categoryId) {
    if (!mongoose.isValidObjectId(data.categoryId)) {
      return res.status(400).json({ error: 'INVALID_CATEGORY_ID' })
    }
    const exists = await CategoryModel.exists({
      _id: data.categoryId,
      userId: req.userId,
      householdId: scope.householdId ?? null,
    })
    if (!exists) return res.status(404).json({ error: 'CATEGORY_NOT_FOUND' })
  }

  const doc = await SpendModel.create({
    ...data,
    userId: req.userId,
    householdId: scope.householdId ?? null,
    currency: data.currency.toUpperCase(),
    title: data.title.trim(),
    serviceKey: data.serviceKey?.trim().toLowerCase() || null,
    notes: data.notes?.trim() || null,
    occurredAt: data.occurredAt ?? new Date(),
    renewalAt: data.renewalAt ?? null,
    attachments: data.attachments ?? [],
  })

  res.status(201).json({ item: doc.toObject() })
})

router.patch('/:id', async (req, res) => {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'INVALID_ID' })
  }

  const patch = updateSchema.parse(req.body)
  const scope = await getActiveScopeForUser(req.userId!)
  if (patch.currency) patch.currency = patch.currency.toUpperCase()
  if (patch.title) patch.title = patch.title.trim()
  if (patch.serviceKey) patch.serviceKey = patch.serviceKey.trim().toLowerCase()
  if (patch.notes) patch.notes = patch.notes.trim()

  if (patch.categoryId) {
    if (!mongoose.isValidObjectId(patch.categoryId)) {
      return res.status(400).json({ error: 'INVALID_CATEGORY_ID' })
    }
    const exists = await CategoryModel.exists({
      _id: patch.categoryId,
      userId: req.userId,
      householdId: scope.householdId ?? null,
    })
    if (!exists) return res.status(404).json({ error: 'CATEGORY_NOT_FOUND' })
  }

  const updated = await SpendModel.findOneAndUpdate(
    { _id: id, userId: req.userId, householdId: scope.householdId ?? null },
    { $set: patch },
    { new: true },
  )
  if (!updated) return res.status(404).json({ error: 'NOT_FOUND' })

  res.json({ item: updated.toObject() })
})

router.delete('/:id', async (req, res) => {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'INVALID_ID' })
  }

  const scope = await getActiveScopeForUser(req.userId!)
  const deleted = await SpendModel.findOneAndDelete({ _id: id, userId: req.userId, householdId: scope.householdId ?? null })
  if (!deleted) return res.status(404).json({ error: 'NOT_FOUND' })

  res.status(204).send()
})

export default router

