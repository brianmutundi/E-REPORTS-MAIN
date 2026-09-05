import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
import { getBroadsheetExportData } from '@/lib/results'

export const runtime = 'nodejs'
type CellFont = { bold?: boolean; sz?: number; color?: { rgb: string } }
type CellFill = { fgColor?: { rgb: string } }
type CellAlignment = { horizontal?: 'center' | 'left' | 'right' }
type CellBorder = { style?: string; color?: { rgb: string } }
type CellStyle = { font?: CellFont; fill?: CellFill; alignment?: CellAlignment; border?: { top?: CellBorder; bottom?: CellBorder } }
const BORDER_THIN: CellBorder = { style: 'thin', color: { rgb: 'CBD5E1' } }
const BORDER_MEDIUM: CellBorder = { style: 'thin', color: { rgb: 'AEB8C7' } }

export async function GET(request: NextRequest) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return new Response('Unauthorized',{status:401})
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id',user.id).single(); if(!profile?.tenant_id)return new Response('No school linked',{status:403})
  const throttled=limitAuthenticatedRoute(request.headers,user.id,'export-broadsheet-xlsx',30); if(throttled)return throttled
  const url=new URL(request.url); const examId=url.searchParams.get('exam')?.trim(); const classId=url.searchParams.get('class')?.trim(); const streamId=url.searchParams.get('stream')?.trim()||undefined; if(!examId||!classId)return new Response('exam and class are required',{status:400})
  const data=await getBroadsheetExportData(examId,classId,streamId); if(!data)return new Response('Broadsheet scope not found',{status:404})
  const {tenant,exam,className,results,columns}=data; const colCount=3+columns.length+3; const sheet=XLSX.utils.aoa_to_sheet([])
  const setCell=(r:number,c:number,value:string|number,style?:CellStyle)=>{sheet[XLSX.utils.encode_cell({r,c})]={v:value,t:typeof value==='number'?'n':'s',s:style?{font:style.font,fill:style.fill,alignment:style.alignment,border:style.border}:undefined}}
  let row=0; setCell(row,0,tenant.name,{font:{bold:true,sz:16}}); row++; if(tenant.address){setCell(row,0,`P.O Box: ${tenant.address}`,{font:{bold:true,sz:10}});row++} setCell(row,0,'ASSESSMENT BROADSHEET',{font:{bold:true,sz:12}});row++;setCell(row,0,[exam.name,className].filter(Boolean).join(' · '));row++;if(exam.term||exam.academic_year){setCell(row,0,[exam.term,exam.academic_year].filter(v=>v).join(' · '));row++}setCell(row,0,`Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`);row++;row++;const headerRow=row
  ;['S/N','Adm No','Student Name',...columns.map(c=>c.subjectName),'Average','Total','Level'].forEach((value,i)=>setCell(row,i,value,{font:{bold:true},fill:{fgColor:{rgb:'EEF2F7'}},border:{top:BORDER_MEDIUM,bottom:BORDER_MEDIUM}}));row++
  const center:CellAlignment={horizontal:'center'}; results.forEach((r,index)=>{const scores=columns.map(c=>r.subjects.find(s=>s.subjectId===c.subjectId)?.score??'');const cells:(string|number)[]=[index+1,r.admissionNo,r.fullName,...scores,r.complete?Number(r.average.toFixed(2)):'',r.complete?Number(r.total.toFixed(2)):'',r.complete?r.grade:'Incomplete'];cells.forEach((value,i)=>{const font:CellFont|undefined=i===0?{bold:true}:!r.complete&&i===colCount-1?{color:{rgb:'B45309'},bold:true}:undefined;setCell(row,i,value,{font,alignment:i===2?{horizontal:'left'}:center,border:{top:BORDER_THIN,bottom:BORDER_THIN}})});row++})
  sheet['!merges']=Array.from({length:headerRow},(_,i)=>({s:{r:i,c:0},e:{r:i,c:colCount-1}}));sheet['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:results.length?headerRow+results.length-1:headerRow,c:colCount-1}});sheet['!cols']=[{wch:5},{wch:14},{wch:34},...columns.map(()=>({wch:15})),{wch:10},{wch:10},{wch:10}]
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,'Broadsheet');const buffer=XLSX.write(workbook,{bookType:'xlsx',type:'buffer'});const safeClass=className.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'class';const safeExam=exam.name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'exam'
  return new Response(buffer,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${safeClass}-${safeExam}-broadsheet.xlsx"`,'Cache-Control':'no-store'}})
}
