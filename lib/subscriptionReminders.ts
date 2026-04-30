import * as Notifications from "expo-notifications"
import * as SecureStore from "expo-secure-store"
import dayjs from "dayjs"

const STORE_KEY = "subscription_reminders_v1"

type ReminderIndex = Record<string, string> // spendId -> notificationId

async function readIndex(): Promise<ReminderIndex> {
  const raw = await SecureStore.getItemAsync(STORE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as ReminderIndex
    if (!parsed || typeof parsed !== "object") return {}
    return parsed
  } catch {
    return {}
  }
}

async function writeIndex(idx: ReminderIndex): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(idx))
}

let permissionChecked = false
async function ensurePermissions(): Promise<boolean> {
  if (permissionChecked) {
    const current = await Notifications.getPermissionsAsync()
    return current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  }
  permissionChecked = true
  const current = await Notifications.getPermissionsAsync()
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true
  const req = await Notifications.requestPermissionsAsync()
  return req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
}

function reminderDateForRenewal(renewalAt: string): Date | null {
  const renewal = dayjs(renewalAt)
  if (!renewal.isValid()) return null

  // Schedule 3 days before at 09:00 local time.
  const at = renewal.subtract(3, "day").hour(9).minute(0).second(0).millisecond(0)
  if (!at.isValid()) return null
  if (at.isBefore(dayjs().add(30, "second"))) return null
  return at.toDate()
}

export async function cancelReminderForSpendId(spendId: string): Promise<void> {
  const idx = await readIndex()
  const existing = idx[spendId]
  if (existing) {
    try {
      await Notifications.cancelScheduledNotificationAsync(existing)
    } catch {
      // ignore: notification might already be gone
    }
    delete idx[spendId]
    await writeIndex(idx)
  }
}

export async function syncSubscriptionReminders(
  spends: Array<{ _id: string; title: string; renewalAt?: string | null }>,
): Promise<void> {
  const allowed = await ensurePermissions()
  if (!allowed) return

  const idx = await readIndex()
  const seen = new Set<string>()

  for (const s of spends) {
    seen.add(s._id)

    if (!s.renewalAt) {
      if (idx[s._id]) await cancelReminderForSpendId(s._id)
      continue
    }

    const triggerDate = reminderDateForRenewal(s.renewalAt)
    if (!triggerDate) {
      if (idx[s._id]) await cancelReminderForSpendId(s._id)
      continue
    }

    // Cancel and replace to keep date/title up to date.
    if (idx[s._id]) {
      try {
        await Notifications.cancelScheduledNotificationAsync(idx[s._id])
      } catch {
        // ignore
      }
      delete idx[s._id]
    }

    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Subscription ending soon",
        body: `${s.title} ends in 3 days.`,
        data: { spendId: s._id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    })

    idx[s._id] = notifId
  }

  // Remove reminders for spends that no longer exist locally.
  for (const spendId of Object.keys(idx)) {
    if (seen.has(spendId)) continue
    try {
      await Notifications.cancelScheduledNotificationAsync(idx[spendId])
    } catch {
      // ignore
    }
    delete idx[spendId]
  }

  await writeIndex(idx)
}

