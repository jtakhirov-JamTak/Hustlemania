export const AREAS = [
  { key: "health", name: "Health" },
  { key: "wealth", name: "Wealth" },
  { key: "relationships", name: "Relationships" },
] as const;

export type AreaKey = (typeof AREAS)[number]["key"];

export function isAreaKey(value: string): value is AreaKey {
  return AREAS.some((a) => a.key === value);
}

export function areaName(key: AreaKey): string {
  return AREAS.find((a) => a.key === key)!.name;
}
