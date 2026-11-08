export const PTT_KEY = 'ptt-v3' as const;

export const SETTING_DEFAULTS = {
  goal: 12,
  newPerDay: 5,
  allowInv: false,
  metronome: false,
  drone: false,
  earKeys: false,
} as const;

export const SETTING_GOALS = [8, 12, 16, 24] as const;
export const SETTING_NEW_PER_DAY = [3, 5, 8, 12] as const;

export type AppSettings = {
  goal: number;
  newPerDay: number;
  allowInv: boolean;
  metronome: boolean;
  drone: boolean;
  earKeys: boolean;
};

export type PttV3Payload = {
  v: 3;
  data: Record<string, unknown> & { settings?: Record<string, unknown>; srs?: Record<string, unknown> };
  [key: string]: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function restoreSettings(value: unknown): AppSettings {
  const settings = isRecord(value) ? value : {};
  const goal = SETTING_GOALS.includes(settings.goal as (typeof SETTING_GOALS)[number])
    ? settings.goal as number
    : SETTING_DEFAULTS.goal;
  const newPerDay = SETTING_NEW_PER_DAY.includes(settings.newPerDay as (typeof SETTING_NEW_PER_DAY)[number])
    ? settings.newPerDay as number
    : SETTING_DEFAULTS.newPerDay;
  return {
    goal,
    newPerDay,
    allowInv: settings.allowInv === true,
    metronome: settings.metronome === true,
    drone: settings.drone === true,
    earKeys: settings.earKeys === true,
  };
}

export function isBackupPayload(value: unknown): value is PttV3Payload {
  return isRecord(value) &&
    value.v === 3 &&
    isRecord(value.data) &&
    (value.data.settings === undefined || isRecord(value.data.settings)) &&
    (value.data.srs === undefined || isRecord(value.data.srs));
}

export function parsePttV3(raw: string | null): PttV3Payload | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isBackupPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
