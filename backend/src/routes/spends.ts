import { Router } from 'express'
import { z } from 'zod'
import mongoose from 'mongoose'

import { requireUser } from '../middleware/requireUser.js'
import { CategoryModel } from '../models/Category.js'
import { SpendModel } from '../models/Spend.js'
import { scanReceiptFromBase64 } from '../receipt/scanReceipt.js'

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
})

const updateSchema = createSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field must be provided' })

const receiptScanSchema = z.object({
  imageBase64: z.string().min(50),
  mimeType: z.string().optional().nullable(),
})

router.use(requireUser)

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')

  const from = req.query.from ? new Date(String(req.query.from)) : null
  const to = req.query.to ? new Date(String(req.query.to)) : null
  const filter: Record<string, unknown> = { userId: req.userId }

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

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body)

  if (data.categoryId) {
    if (!mongoose.isValidObjectId(data.categoryId)) {
      return res.status(400).json({ error: 'INVALID_CATEGORY_ID' })
    }
    const exists = await CategoryModel.exists({ _id: data.categoryId, userId: req.userId })
    if (!exists) return res.status(404).json({ error: 'CATEGORY_NOT_FOUND' })
  }

  const doc = await SpendModel.create({
    ...data,
    userId: req.userId,
    currency: data.currency.toUpperCase(),
    title: data.title.trim(),
    serviceKey: data.serviceKey?.trim().toLowerCase() || null,
    notes: data.notes?.trim() || null,
    occurredAt: data.occurredAt ?? new Date(),
    renewalAt: data.renewalAt ?? null,
  })

  res.status(201).json({ item: doc.toObject() })
})

router.patch('/:id', async (req, res) => {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'INVALID_ID' })
  }

  const patch = updateSchema.parse(req.body)
  if (patch.currency) patch.currency = patch.currency.toUpperCase()
  if (patch.title) patch.title = patch.title.trim()
  if (patch.serviceKey) patch.serviceKey = patch.serviceKey.trim().toLowerCase()
  if (patch.notes) patch.notes = patch.notes.trim()

  if (patch.categoryId) {
    if (!mongoose.isValidObjectId(patch.categoryId)) {
      return res.status(400).json({ error: 'INVALID_CATEGORY_ID' })
    }
    const exists = await CategoryModel.exists({ _id: patch.categoryId, userId: req.userId })
    if (!exists) return res.status(404).json({ error: 'CATEGORY_NOT_FOUND' })
  }

  const updated = await SpendModel.findOneAndUpdate({ _id: id, userId: req.userId }, { $set: patch }, { new: true })
  if (!updated) return res.status(404).json({ error: 'NOT_FOUND' })

  res.json({ item: updated.toObject() })
})

router.delete('/:id', async (req, res) => {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'INVALID_ID' })
  }

  const deleted = await SpendModel.findOneAndDelete({ _id: id, userId: req.userId })
  if (!deleted) return res.status(404).json({ error: 'NOT_FOUND' })

  res.status(204).send()
})

export default router

