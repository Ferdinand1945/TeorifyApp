import { Router } from 'express'
import { z } from 'zod'

import { requireUser } from '../middleware/requireUser.js'
import { CategoryModel } from '../models/Category.js'
import { getActiveScopeForUser } from '../scope/activeScope.js'

const router = Router()

const createSchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(['subscription', 'expense', 'income']).default('expense'),
})

router.use(requireUser)

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const scope = await getActiveScopeForUser(req.userId!)
  const filter: Record<string, unknown> = { userId: req.userId, householdId: scope.householdId ?? null }
  const items = await CategoryModel.find(filter).sort({ kind: 1, name: 1 }).lean()
  res.json({ items })
})

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body)
  const scope = await getActiveScopeForUser(req.userId!)
  const doc = await CategoryModel.create({
    userId: req.userId,
    householdId: scope.householdId ?? null,
    name: data.name.trim(),
    kind: data.kind,
  })
  res.status(201).json({ item: doc.toObject() })
})

router.post('/seed', async (req, res) => {
  const scope = await getActiveScopeForUser(req.userId!)
  const defaults: Array<{ name: string; kind: 'subscription' | 'expense' | 'income' }> = [
    { name: 'Subscriptions', kind: 'subscription' },
    { name: 'Food', kind: 'expense' },
    { name: 'Health', kind: 'expense' },
    { name: 'Unanticipated', kind: 'expense' },
    { name: 'Pets', kind: 'expense' },
    { name: 'Vacation', kind: 'expense' },
    { name: 'Transport', kind: 'expense' },
    { name: 'Home', kind: 'expense' },
    { name: 'Entertainment', kind: 'expense' },
    { name: 'Shopping', kind: 'expense' },
    { name: 'Education', kind: 'expense' },
    { name: 'Salary', kind: 'income' },
  ]

  await CategoryModel.bulkWrite(
    defaults.map((d) => ({
      updateOne: {
        filter: { userId: req.userId, householdId: scope.householdId ?? null, name: d.name, kind: d.kind },
        update: { $setOnInsert: { userId: req.userId, householdId: scope.householdId ?? null, name: d.name, kind: d.kind } },
        upsert: true,
      },
    })),
  )

  const items = await CategoryModel.find({ userId: req.userId, householdId: scope.householdId ?? null })
    .sort({ kind: 1, name: 1 })
    .lean()
  res.json({ items })
})

export default router

