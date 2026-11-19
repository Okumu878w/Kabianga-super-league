import { NextRequest, NextResponse } from 'next/server';
import { TEMPLATES, templateCsv, templateXlsx, type TemplateKind } from '@/lib/imports/templates';
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params; if (!(kind in TEMPLATES)) return new NextResponse('Not found', { status: 404 });
  const k = kind as TemplateKind;
  if (req.nextUrl.searchParams.get('format') === 'xlsx') return new NextResponse(templateXlsx(k) as any, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="ksl-${k}-template.xlsx"` } });
  return new NextResponse(templateCsv(k), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ksl-${k}-template.csv"` } });
}
