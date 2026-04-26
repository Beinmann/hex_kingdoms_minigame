export type CombatSide = { strength: number };
export type CombatOutcome = { a: number; b: number };

export function resolveCombat(a: CombatSide, b: CombatSide): CombatOutcome {
  const killed = Math.min(a.strength, b.strength);
  return {
    a: Math.max(0, a.strength - killed),
    b: Math.max(0, b.strength - killed),
  };
}
