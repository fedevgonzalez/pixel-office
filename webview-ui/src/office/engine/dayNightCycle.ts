import {
  DN_SUNRISE_START,
  DN_SUNRISE_END,
  DN_SUNSET_START,
  DN_SUNSET_END,
  DN_EVENING_END,
  DN_SUMMER_OFFSET_H,
  DN_WINTER_OFFSET_H,
} from '../../constants.js'

/** Time periods for the day/night cycle */
export const TimePeriod = {
  NIGHT: 'night',
  SUNRISE: 'sunrise',
  DAY: 'day',
  SUNSET: 'sunset',
  EVENING: 'evening',
} as const
export type TimePeriod = (typeof TimePeriod)[keyof typeof TimePeriod]

/** Hemisphere affects seasons (month→sunset offset) */
export const Hemisphere = {
  NORTH: 'north',
  SOUTH: 'south',
} as const
export type Hemisphere = (typeof Hemisphere)[keyof typeof Hemisphere]

/** Time mode: real clock or fixed period for testing */
export const TimeMode = {
  REAL: 'real',
  FIXED_DAY: 'fixed_day',
  FIXED_NIGHT: 'fixed_night',
  FIXED_SUNSET: 'fixed_sunset',
  FIXED_SUNRISE: 'fixed_sunrise',
} as const
export type TimeMode = (typeof TimeMode)[keyof typeof TimeMode]

export interface DayNightState {
  /** Current time period */
  period: TimePeriod
  /** 0-1 blend factor within the current transition (1 = fully in period) */
  blend: number
  /** How dark the scene should be (0 = full day, 1 = full night) */
  darkness: number
  /** Current hour (0-24, fractional) */
  hour: number
}

/** Get seasonal offset for sunset/evening times based on month and hemisphere */
function getSeasonalOffset(hemisphere: Hemisphere): number {
  const month = new Date().getMonth() // 0-11
  // Sinusoidal: peaks at June (month 5) for north, December (month 11) for south
  const phase = hemisphere === Hemisphere.NORTH ? month : (month + 6) % 12
  // Map 0-11 to 0-2π, peak at month 5 (June)
  const angle = ((phase - 2) / 12) * Math.PI * 2
  const t = (Math.sin(angle) + 1) / 2 // 0-1, peaks at summer
  return DN_WINTER_OFFSET_H + t * (DN_SUMMER_OFFSET_H - DN_WINTER_OFFSET_H)
}

/** Calculate the current day/night state from wall clock time */
export function getDayNightState(
  mode: TimeMode,
  hemisphere: Hemisphere,
): DayNightState {
  // Fixed modes for testing/preview
  if (mode === TimeMode.FIXED_DAY) {
    return { period: TimePeriod.DAY, blend: 1, darkness: 0, hour: 12 }
  }
  if (mode === TimeMode.FIXED_NIGHT) {
    return { period: TimePeriod.NIGHT, blend: 1, darkness: 1, hour: 2 }
  }
  if (mode === TimeMode.FIXED_SUNSET) {
    return { period: TimePeriod.SUNSET, blend: 0.5, darkness: 0.35, hour: 19 }
  }
  if (mode === TimeMode.FIXED_SUNRISE) {
    return { period: TimePeriod.SUNRISE, blend: 0.5, darkness: 0.2, hour: 6 }
  }

  const now = new Date()
  const hour = now.getHours() + now.getMinutes() / 60

  const offset = getSeasonalOffset(hemisphere)
  const sunsetStart = DN_SUNSET_START + offset
  const sunsetEnd = DN_SUNSET_END + offset
  const eveningEnd = DN_EVENING_END + offset

  // Determine period and blend
  if (hour < DN_SUNRISE_START) {
    // Deep night (before sunrise)
    return { period: TimePeriod.NIGHT, blend: 1, darkness: 1, hour }
  }
  if (hour < DN_SUNRISE_END) {
    // Sunrise transition
    const t = (hour - DN_SUNRISE_START) / (DN_SUNRISE_END - DN_SUNRISE_START)
    return { period: TimePeriod.SUNRISE, blend: t, darkness: 1 - t * 0.8, hour }
  }
  if (hour < sunsetStart) {
    // Full day
    return { period: TimePeriod.DAY, blend: 1, darkness: 0, hour }
  }
  if (hour < sunsetEnd) {
    // Sunset transition
    const t = (hour - sunsetStart) / (sunsetEnd - sunsetStart)
    return { period: TimePeriod.SUNSET, blend: t, darkness: t * 0.35, hour }
  }
  if (hour < eveningEnd) {
    // Evening transition
    const t = (hour - sunsetEnd) / (eveningEnd - sunsetEnd)
    return { period: TimePeriod.EVENING, blend: t, darkness: 0.35 + t * 0.65, hour }
  }
  // Night
  return { period: TimePeriod.NIGHT, blend: 1, darkness: 1, hour }
}
