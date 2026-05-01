import mongoose, { Schema } from 'mongoose'

export interface HouseholdDoc {
  name: string
  joinCode: string
  memberUserIds: string[]
  createdByUserId: string
  createdAt: Date
  updatedAt: Date
}

const householdSchema = new Schema<HouseholdDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    joinCode: { type: String, required: true, unique: true, index: true },
    memberUserIds: { type: [String], required: true, default: [], index: true },
    createdByUserId: { type: String, required: true, index: true },
  },
  { timestamps: true },
)

householdSchema.index({ joinCode: 1 }, { unique: true })
householdSchema.index({ memberUserIds: 1 })

export const HouseholdModel =
  mongoose.models.Household || mongoose.model<HouseholdDoc>('Household', householdSchema)

