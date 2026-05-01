import mongoose, { Schema } from 'mongoose'

export type UserSettings = {
  userId: string
  monthlyIncomeCents?: number | null
  monthlyIncomeCurrency?: string | null
  activeHouseholdId?: string | null
  createdAt: Date
  updatedAt: Date
}

const UserSettingsSchema = new Schema<UserSettings>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    monthlyIncomeCents: { type: Number, required: false, default: null },
    monthlyIncomeCurrency: { type: String, required: false, default: null },
    activeHouseholdId: { type: String, required: false, default: null, index: true },
  },
  { timestamps: true },
)

export const UserSettingsModel =
  (mongoose.models.UserSettings as mongoose.Model<UserSettings>) ||
  mongoose.model<UserSettings>('UserSettings', UserSettingsSchema)

