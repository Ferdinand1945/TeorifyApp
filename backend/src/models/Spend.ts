import mongoose, { Schema } from 'mongoose'

export type SpendType = 'expense' | 'income'

export interface SpendDoc {
  userId: string
  title: string
  type: SpendType
  amountCents: number
  currency: string
  occurredAt: Date
  renewalAt?: Date | null
  categoryId?: string | null
  notes?: string | null
  createdAt: Date
  updatedAt: Date
}

const spendSchema = new Schema<SpendDoc>(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['expense', 'income'], default: 'expense' },
    amountCents: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    occurredAt: { type: Date, required: true, default: Date.now, index: true },
    renewalAt: { type: Date, required: false, default: null },
    categoryId: { type: String, required: false, default: null },
    notes: { type: String, required: false, default: null, trim: true },
  },
  { timestamps: true },
)

spendSchema.index({ userId: 1, occurredAt: -1 })

export const SpendModel = mongoose.models.Spend || mongoose.model<SpendDoc>('Spend', spendSchema)

