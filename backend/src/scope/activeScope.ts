import { UserSettingsModel } from '../models/UserSettings.js'

export type ActiveScope = {
  householdId: string | null
}

export async function getActiveScopeForUser(userId: string): Promise<ActiveScope> {
  const settings = await UserSettingsModel.findOne({ userId }).lean()
  return { householdId: (settings as any)?.activeHouseholdId ?? null }
}

