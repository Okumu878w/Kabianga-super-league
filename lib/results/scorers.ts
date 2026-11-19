/**
 * Scorer text → match events.
 * One scorer per line or separated by ";". Examples:
 *   Peter Otieno 23'          goal in minute 23
 *   Peter Otieno, 23          same
 *   Peter Otieno (p) 45       penalty
 *   Peter Otieno (og) 80      own goal — listed under the team that BENEFITED; the player is looked up in the OPPONENT squad
 *   Peter Otieno (2)          two goals, minutes unknown
 *   Peter Otieno x2           same
 */
export type SquadPlayer = { player_id: string; name: string };
export type ScorerLine = { raw: string; name: string; minute: number | null; kind: 'goal' | 'penalty_scored' | 'own_goal'; count: number };
export type ResultEvent = { team_id: string; player_id: string; event_type: ScorerLine['kind']; minute: number | null };

export function parseScorerText(text: string): ScorerLine[] {
  const out: ScorerLine[] = [];
  for (const rawPart of (text ?? '').split(/[\n;]+/)) {
    let s = rawPart.trim(); if (!s) continue;
    const raw = s; let kind: ScorerLine['kind'] = 'goal'; let count = 1; let minute: number | null = null;
    if (/\(\s*(og|o\.g\.?|own goal)\s*\)|\bog\b/i.test(s)) { kind = 'own_goal'; s = s.replace(/\(\s*(og|o\.g\.?|own goal)\s*\)|\bog\b/gi, ' '); }
    else if (/\(\s*(p|pen|penalty)\s*\)|\bpen\b/i.test(s)) { kind = 'penalty_scored'; s = s.replace(/\(\s*(p|pen|penalty)\s*\)|\bpen\b/gi, ' '); }
    let m = /\(\s*(\d)\s*\)|[x×]\s*(\d)\b/i.exec(s); if (m) { count = +(m[1] ?? m[2]); s = s.replace(m[0], ' '); }
    m = /[,\s]\s*(\d{1,3})\s*['’′]?\s*$/.exec(s); if (m && +m[1] <= 150) { minute = +m[1]; s = s.slice(0, m.index); }
    const name = s.replace(/[,'’′]+$/g, '').replace(/\s+/g, ' ').trim();
    out.push({ raw, name, minute, kind, count: Math.min(Math.max(count, 1), 9) });
  }
  return out;
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export function resolvePlayer(name: string, squad: SquadPlayer[]): { id: string } | { error: string } {
  const n = norm(name); if (!n) return { error: 'Missing player name' };
  const exact = squad.filter((p) => norm(p.name) === n); if (exact.length === 1) return { id: exact[0].player_id };
  const last = n.split(' ').pop()!;
  const pools = [squad.filter((p) => norm(p.name).split(' ').pop() === last && (n.split(' ').length === 1 || norm(p.name).includes(n.split(' ')[0]))), squad.filter((p) => norm(p.name).includes(n))];
  for (const pool of pools) { if (pool.length === 1) return { id: pool[0].player_id }; if (pool.length > 1) return { error: `"${name}" matches more than one player (${pool.map((p) => p.name).join(', ')}); use the full name` }; }
  return { error: `"${name}" is not in the squad. Register the player first, or leave the name out and tick "some scorers unknown"` };
}
/** `teamId` is the team that scored (or benefited); `oppId` the other side. */
export function buildEvents(teamId: string, oppId: string, text: string, squads: Map<string, SquadPlayer[]>): { events: ResultEvent[]; errors: string[] } {
  const events: ResultEvent[] = []; const errors: string[] = [];
  for (const l of parseScorerText(text)) {
    const owner = l.kind === 'own_goal' ? oppId : teamId; const r = resolvePlayer(l.name, squads.get(owner) ?? []);
    if ('error' in r) { errors.push(r.error); continue; }
    for (let i = 0; i < l.count; i++) events.push({ team_id: owner, player_id: r.id, event_type: l.kind, minute: l.minute });
  }
  return { events, errors };
}
