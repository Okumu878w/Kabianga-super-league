'use client';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
const tip = { contentStyle: { background: '#17243A', border: '1px solid #26354f', borderRadius: 8, fontSize: 12 } };
export function MatchesChart({ data }: { data: { label: string; matches: number; goals: number }[] }) {
  if (!data.length) return <div className="empty">Charts appear after results are published.</div>;
  return <div style={{ height: 240 }} role="img" aria-label="Matches played and goals scored per matchweek"><ResponsiveContainer><LineChart data={data}><CartesianGrid stroke="#26354f" strokeDasharray="3 3" /><XAxis dataKey="label" stroke="#9CA9BA" fontSize={11} /><YAxis stroke="#9CA9BA" fontSize={11} allowDecimals={false} /><Tooltip {...tip} /><Line dataKey="matches" name="Matches" stroke="#16C784" strokeWidth={2} /><Line dataKey="goals" name="Goals" stroke="#F5C451" strokeWidth={2} /></LineChart></ResponsiveContainer></div>;
}
export function TeamsChart({ data }: { data: { name: string; points: number }[] }) {
  if (!data.length) return <div className="empty">No standings yet.</div>;
  return <div style={{ height: 240 }} role="img" aria-label="Points by team"><ResponsiveContainer><BarChart data={data}><CartesianGrid stroke="#26354f" strokeDasharray="3 3" /><XAxis dataKey="name" stroke="#9CA9BA" fontSize={11} /><YAxis stroke="#9CA9BA" fontSize={11} allowDecimals={false} /><Tooltip {...tip} /><Bar dataKey="points" fill="#16C784" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>;
}
