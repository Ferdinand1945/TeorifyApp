import mongoose, { Schema } from 'mongoose'

export type SpendType = 'expense' | 'income'

export type SpendAttachmentKind = 'receipt' | 'document' | 'image'

export type SpendAttachment = {
  id: string
  url: string
  mimeType: string
  fileName?: string | null
  kind?: SpendAttachmentKind | null
  sizeBytes?: number | null
  createdAt: Date
}

export interface SpendDoc {
  userId: string
  householdId?: string | null
  title: string
  type: SpendType
  amountCents: number
  currency: string
  occurredAt: Date
  renewalAt?: Date | null
  categoryId?: string | null
  /** Optional canonical service identifier used for UI icons (e.g. "spotify", "netflix"). */
  serviceKey?: string | null
  notes?: string | null
  attachments?: SpendAttachment[]
  createdAt: Date
  updatedAt: Date
}

const spendSchema = new Schema<SpendDoc>(
  {
    userId: { type: String, required: true, index: true },
    householdId: { type: String, required: false, default: null, index: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['expense', 'income'], default: 'expense' },
    amountCents: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    occurredAt: { type: Date, required: true, default: Date.now, index: true },
    renewalAt: { type: Date, required: false, default: null },
    categoryId: { type: String, required: false, default: null },
    serviceKey: { type: String, required: false, default: null, trim: true, lowercase: true },
    notes: { type: String, required: false, default: null, trim: true },
    attachments: {
      type: [
        {
          id: { type: String, required: true },
          url: { type: String, required: true },
          mimeType: { type: String, required: true },
          fileName: { type: String, required: false, default: null },
          kind: { type: String, required: false, default: null },
          sizeBytes: { type: Number, required: false, default: null },
          createdAt: { type: Date, required: true, default: Date.now },
        },
      ],
      required: false,
      default: [],
    },
  },
  { timestamps: true },
)

spendSchema.index({ userId: 1, householdId: 1, occurredAt: -1 })

export const SpendModel = mongoose.models.Spend || mongoose.model<SpendDoc>('Spend', spendSchema)

