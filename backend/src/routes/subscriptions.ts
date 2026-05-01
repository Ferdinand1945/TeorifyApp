import { Router } from 'express'
import { z } from 'zod'
import mongoose from 'mongoose'

import { requireUser } from '../middleware/requireUser.js'
import { CategoryModel } from '../models/Category.js'
import { SubscriptionModel } from '../models/Subscription.js'
import { getActiveScopeForUser } from '../scope/activeScope.js'

const router = Router()

const billingCycleSchema = z.enum(['weekly', 'monthly', 'yearly'])

const subscriptionCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
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
  const scope = await getActiveScopeForUser(req.userId!)
  const items = await SubscriptionModel.find({ userId: req.userId, householdId: scope.householdId ?? null })
    .sort({ nextBillingDate: 1, createdAt: -1 })
    .lean()

  res.json({ items })
})

router.post('/', async (req, res) => {
  const data = subscriptionCreateSchema.parse(req.body)
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
  const doc = await SubscriptionModel.create({
    ...data,
    userId: req.userId,
    householdId: scope.householdId ?? null,
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
  const scope = await getActiveScopeForUser(req.userId!)
  if (patch.currency) patch.currency = patch.currency.toUpperCase()
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

  const updated = await SubscriptionModel.findOneAndUpdate(
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
  const deleted = await SubscriptionModel.findOneAndDelete({
    _id: id,
    userId: req.userId,
    householdId: scope.householdId ?? null,
  })
  if (!deleted) return res.status(404).json({ error: 'NOT_FOUND' })

  res.status(204).send()
})

export default router

