import { Field, Form } from '@/components/ui';
import { saveCompetition } from '@/app/admin/actions/league';
const TB = [['gd_gf', 'Goal difference, then goals scored'], ['gf_gd', 'Goals scored, then goal difference'], ['gd_gf_w', 'Goal difference, goals scored, then wins'], ['w_gd_gf', 'Wins, goal difference, then goals scored']];
export function CompetitionForm({ c, back }: { c?: any; back: string }) {
  const tb = c ? (c.tie_break_rules as string[]).join(',') : '';
  const cur = tb === 'goals_for,goal_difference' ? 'gf_gd' : tb === 'goal_difference,goals_for,wins' ? 'gd_gf_w' : tb === 'wins,goal_difference,goals_for' ? 'w_gd_gf' : 'gd_gf';
  return <Form action={saveCompetition} back={back} cols>{c && <input type="hidden" name="id" value={c.id} />}
    <Field label="Competition name"><input name="name" defaultValue={c?.name} required minLength={3} /></Field>
    <Field label="Type"><select name="format" defaultValue={c?.format ?? 'league'}><option value="league">League</option><option value="knockout">Knockout</option><option value="group_stage">Group stage</option><option value="group_knockout">Group stage + knockout</option></select></Field>
    <Field label="Status"><select name="status" defaultValue={c?.status ?? 'draft'}><option>draft</option><option>active</option><option>completed</option><option>archived</option></select></Field>
    <Field label="Logo (PNG/JPG/WebP, max 2 MB)"><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" /></Field>
    <Field label="Points for a win"><input type="number" name="points_win" min={0} max={10} defaultValue={c?.points_win ?? 3} /></Field><Field label="Points for a draw"><input type="number" name="points_draw" min={0} max={10} defaultValue={c?.points_draw ?? 1} /></Field><Field label="Points for a loss"><input type="number" name="points_loss" min={0} max={10} defaultValue={c?.points_loss ?? 0} /></Field>
    <Field label="Tie-break order (after points)"><select name="tie_break" defaultValue={cur}>{TB.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
    <Field label="Clean sheet: goalkeeper minimum minutes" hint="A keeper earns a clean sheet only if their team concedes 0 and they played at least this many minutes."><input type="number" name="clean_sheet_min_minutes" min={0} max={120} defaultValue={c?.clean_sheet_min_minutes ?? 45} /></Field>
    <Field label="Start date"><input type="date" name="start_date" defaultValue={c?.start_date ?? ''} /></Field><Field label="End date"><input type="date" name="end_date" defaultValue={c?.end_date ?? ''} /></Field>
    <Field label="Description" full><textarea name="description" defaultValue={c?.description ?? ''} /></Field><Field label="Competition rules" full><textarea name="rules" defaultValue={c?.rules ?? ''} /></Field>
    <label className="row gap" style={{ justifyContent: 'flex-start' }}><input type="checkbox" name="is_published" defaultChecked={c?.is_published} /> Active & visible to the public</label>
    <div className="full"><button className="btn">{c ? 'Save changes' : 'Create competition'}</button></div></Form>;
}
