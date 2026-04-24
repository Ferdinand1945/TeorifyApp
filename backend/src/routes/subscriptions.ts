import { Router } from 'express'
import { z } from 'zod'
import mongoose from 'mongoose'

import { requireUser } from '../middleware/requireUser.js'
import { SubscriptionModel } from '../models/Subscription.js'

const router = Router()

const billingCycleSchema = z.enum(['weekly', 'monthly', 'yearly'])

const subscriptionCreateSchema = z.object({
  name: z.string().min(1).max(120),
  amountCents: z.number().int().min(0),
  currency: z.string().min(3).max(3),
  billingCycle: billingCycleSchema,
  nextBillingDate: z.coerce.date(),
  categoryId: z.string().min(1).optional().nullable(),
  isActive: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
})

const subscriptionUpdateSchema = subscriptionCreateSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field must be provided' })

router.use(requireUser)

router.get('/', async (req, res) => {
  // Avoid 304 responses caused by conditional requests in some clients.
  res.setHeader('Cache-Control', 'no-store')
  const items = await SubscriptionModel.find({ userId: req.userId })
    .sort({ nextBillingDate: 1, createdAt: -1 })
    .lean()

  res.json({ items })
})

router.post('/', async (req, res) => {
  const data = subscriptionCreateSchema.parse(req.body)
  const doc = await SubscriptionModel.create({
    ...data,
    userId: req.userId,
    currency: data.currency.toUpperCase(),
  })
  res.status(201).json({ item: doc.toObject() })
})

router.patch('/:id', async (req, res) => {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'INVALID_ID' })
  }

  const patch = subscriptionUpdateSchema.parse(req.body)
  if (patch.currency) patch.currency = patch.currency.toUpperCase()

  const updated = await SubscriptionModel.findOneAndUpdate(
    { _id: id, userId: req.userId },
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

  const deleted = await SubscriptionModel.findOneAndDelete({ _id: id, userId: req.userId })
  if (!deleted) return res.status(404).json({ error: 'NOT_FOUND' })

  res.status(204).send()
})

export default router

