import { icons } from "@/constants/icons"

const SERVICE_LABELS: Record<string, string> = {
  spotify: "Spotify",
  tidal: "Tidal",
  github: "GitHub",
  netflix: "Netflix",
  "hbo-max": "HBO Max",
  "amazon-prime": "Prime",
  youtube: "YouTube",
  apple: "Apple",
  google: "Google",
  notion: "Notion",
  dropbox: "Dropbox",
  openai: "OpenAI",
  adobe: "Adobe",
  medium: "Medium",
  figma: "Figma",
  claude: "Claude",
  canva: "Canva",
}

export function labelForServiceKey(serviceKey?: string | null): string | null {
  if (!serviceKey) return null
  const k = serviceKey.toLowerCase()
  return SERVICE_LABELS[k] ?? serviceKey
}

export function iconSourceForServiceKey(serviceKey?: string | null) {
  const key = (serviceKey || "").toLowerCase()
  if (key === "spotify") return icons.spotify
  if (key === "github") return icons.github
  if (key === "notion") return icons.notion
  if (key === "dropbox") return icons.dropbox
  if (key === "openai") return icons.openai
  if (key === "adobe") return icons.adobe
  if (key === "medium") return icons.medium
  if (key === "figma") return icons.figma
  if (key === "claude") return icons.claude
  if (key === "canva") return icons.canva
  return icons.wallet
}
