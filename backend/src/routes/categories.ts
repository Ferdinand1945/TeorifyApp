import { Router } from 'express'
import { z } from 'zod'

import { requireUser } from '../middleware/requireUser.js'
import { CategoryModel } from '../models/Category.js'

const router = Router()

const createSchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(['subscription', 'expense', 'income']).default('expense'),
})

router.use(requireUser)

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const items = await CategoryModel.find({ userId: req.userId }).sort({ kind: 1, name: 1 }).lean()
  res.json({ items })
})

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body)
  const doc = await CategoryModel.create({
    userId: req.userId,
    name: data.name.trim(),
    kind: data.kind,
  })
  res.status(201).json({ item: doc.toObject() })
})

router.post('/seed', async (req, res) => {
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
        filter: { userId: req.userId, name: d.name, kind: d.kind },
        update: { $setOnInsert: { userId: req.userId, name: d.name, kind: d.kind } },
        upsert: true,
      },
    })),
  )

  const items = await CategoryModel.find({ userId: req.userId }).sort({ kind: 1, name: 1 }).lean()
  res.json({ items })
})

export default router

