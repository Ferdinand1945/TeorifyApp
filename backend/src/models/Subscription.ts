import mongoose, { Schema } from 'mongoose'

export type BillingCycle = 'weekly' | 'monthly' | 'yearly'

export interface SubscriptionDoc {
  userId: string
  name: string
  amountCents: number
  currency: string
  billingCycle: BillingCycle
  nextBillingDate: Date
  categoryId?: string | null
  isActive: boolean
  notes?: string | null
  createdAt: Date
  updatedAt: Date
}

const subscriptionSchema = new Schema<SubscriptionDoc>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    amountCents: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    billingCycle: { type: String, required: true, enum: ['weekly', 'monthly', 'yearly'] },
    nextBillingDate: { type: Date, required: true },
    categoryId: { type: String, required: false, default: null },
    isActive: { type: Boolean, required: true, default: true },
    notes: { type: String, required: false, default: null, trim: true },
  },
  { timestamps: true },
)

subscriptionSchema.index({ userId: 1, nextBillingDate: 1 })

export const SubscriptionModel =
  mongoose.models.Subscription || mongoose.model<SubscriptionDoc>('Subscription', subscriptionSchema)

