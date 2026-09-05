import { NextRequest } from 'next/server'
import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { limitAuthenticatedRoute } from '@/lib/rate-limit'
export const runtime = 'nodejs'

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 18, textAlign: 'center' },
  school: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  title: { fontSize: 13, fontWeight: 700, marginBottom: 4 },
  meta: { fontSize: 9, color: '#475569' },
  table: { borderLeft: '1 solid #cbd5e1', borderTop: '1 solid #cbd5e1', marginTop: 12 },
  row: { flexDirection: 'row' },
  headerRow: { backgroundColor: '#f1f5f9', fontWeight: 700 },
  cell: { padding: 7, borderRight: '1 solid #cbd5e1', borderBottom: '1 solid #cbd5e1' },
  admission: { width: '35%' },
  name: { width: '65%' },
})

function StudentRosterPdf({ schoolName, className, count, students }: { schoolName: string; className: string; count: number; students: { admission_no: string; full_name: string }[] }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.school}>{schoolName}</Text>
          <Text style={styles.title}>Student Roster — {className}</Text>
          <Text style={styles.meta}>Student count: {count}</Text>
        </View>
        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]} fixed>
            <Text style={[styles.cell, styles.admission]}>Admission No.</Text>
            <Text style={[styles.cell, styles.name]}>Name</Text>
          </View>
          {students.map(student => (
            <View style={styles.row} wrap={false} key={`${student.admission_no}-${student.full_name}`}>
              <Text style={[styles.cell, styles.admission]}>{student.admission_no}</Text>
              <Text style={[styles.cell, styles.name]}>{student.full_name}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return new Response('No school linked', { status: 403 })

  const throttled = limitAuthenticatedRoute(request.headers, user.id, 'export-students-pdf', 30)
  if (throttled) return throttled

  const classId = new URL(request.url).searchParams.get('class_id')?.trim()
  if (!classId) return new Response('class_id is required', { status: 400 })

  const [{ data: cls }, { data: tenant }] = await Promise.all([
    supabase.from('classes').select('id,name').eq('id', classId).eq('tenant_id', profile.tenant_id).maybeSingle(),
    supabase.from('tenants').select('name').eq('id', profile.tenant_id).maybeSingle(),
  ])
  if (!cls) return new Response('Class not found', { status: 404 })

  const { data: students, error } = await supabase
    .from('students')
    .select('admission_no,full_name')
    .eq('tenant_id', profile.tenant_id)
    .eq('class_id', cls.id)
    .order('full_name')
  if (error) return new Response('Could not load the selected grade roster.', { status: 500 })

  const pdf = await renderToBuffer(<StudentRosterPdf schoolName={tenant?.name ?? 'School'} className={cls.name} count={students?.length ?? 0} students={students ?? []} />)
  const safeClass = cls.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'class'
  return new Response(pdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeClass}-students.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
