import mongoose, { Schema } from 'mongoose'

export type CategoryKind = 'subscription' | 'expense' | 'income'

export interface CategoryDoc {
  userId: string
  householdId?: string | null
  name: string
  kind: CategoryKind
  createdAt: Date
  updatedAt: Date
}

const categorySchema = new Schema<CategoryDoc>(
  {
    userId: { type: String, required: true, index: true },
    householdId: { type: String, required: false, default: null, index: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, required: true, enum: ['subscription', 'expense', 'income'], default: 'expense' },
  },
  { timestamps: true },
)

categorySchema.index({ userId: 1, householdId: 1, name: 1, kind: 1 }, { unique: true })

export const CategoryModel =
  mongoose.models.Category || mongoose.model<CategoryDoc>('Category', categorySchema)

