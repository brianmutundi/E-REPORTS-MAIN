/**
 * AssessmentReportCBC.tsx
 *
 * React-PDF port of the "Assessment Report" HTML template (4-level CBC scale).
 * Drop this into your templates folder (e.g. components/reports/templates/)
 * and register it in your template registry as a new selectable option —
 * see the bottom of this file for a registry snippet.
 *
 * Requires: @react-pdf/renderer  (npm install @react-pdf/renderer)
 */


import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";


// ---------- Types (mirrors the {{placeholders}} in the original template) ----------


export interface PerformanceLevel {
  code: string;        // e.g. "EE"
  code_slug: "ee" | "me" | "ae" | "be" | string;
  name: string;         // e.g. "Exceeding Expectation"
  range: string;         // e.g. "80 - 100"
}


export interface SubjectScore {
  name: string;
  score: number | string;
  level_code: string;
  level_slug: "ee" | "me" | "ae" | "be" | string;
  level_description: string;
}


export interface AssessmentReportData {
  school: {
    name: string;
    box_number: string;
    location: string;
    logo_url?: string;
    initials: string;
  };
  student: {
    name: string;
    admission_number: string;
    grade: string;
  };
  exam: {
    term_title: string;
  };
  performance_levels: PerformanceLevel[];
  subjects: SubjectScore[];
  summary: {
    total_score: number | string;
    overall_level_code: string;
    overall_level_name: string;
  };
  term: {
    closing_date: string;
    opening_date: string;
  };
  financials: {
    fee_balance: string;
    next_term_fee: string;
  };
  remarks: {
    teacher: { text: string; name: string };
    principal: { text: string; name: string };
  };
}


// ---------- Design tokens (from the original CSS) ----------


const COLORS = {
  primary: "#1e3a8a",
  primaryLight: "#eff6ff",
  border: "#cbd5e1",
  borderDark: "#1e293b",
  text: "#0f172a",
  textMuted: "#475569",
  rowAlt: "#f8fafc",
};


const BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  ee: { bg: "#dcfce7", fg: "#166534" },
  me: { bg: "#dbeafe", fg: "#1e40af" },
  ae: { bg: "#fef9c3", fg: "#854d0e" },
  be: { bg: "#fee2e2", fg: "#991b1b" },
};


function badgeColor(slug: string) {
  return BADGE_COLORS[slug] ?? { bg: "#f1f5f9", fg: COLORS.textMuted };
}


// ---------- Styles ----------


const styles = StyleSheet.create({
  page: {
    padding: 18,
    fontSize: 9,
    color: COLORS.text,
    fontFamily: "Helvetica",
  },
  pageBorderOuter: {
    flex: 1,
    borderWidth: 2,
    borderColor: COLORS.borderDark,
    padding: 14,
  },
  pageBorderInner: {
    flex: 1,
    borderWidth: 0.75,
    borderColor: COLORS.borderDark,
    padding: 12,
  },


  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.primary,
    paddingBottom: 8,
    marginBottom: 10,
  },
  logoBox: { width: 60, alignItems: "center" },
  logoImage: { width: 50, height: 50, borderRadius: 25 },
  logoCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  logoCircleText: { color: COLORS.primary, fontFamily: "Helvetica-Bold", fontSize: 11 },
  schoolInfo: { flex: 1, alignItems: "center" },
  schoolTitle: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: COLORS.primary,
    textTransform: "uppercase",
  },
  schoolAddress: { fontSize: 8, color: COLORS.textMuted, marginTop: 2 },
  reportTitle: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    marginTop: 5,
    textTransform: "uppercase",
  },


  // Meta table
  metaTable: {
    flexDirection: "row",
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  metaCell: { flex: 1, padding: 7 },
  metaLabel: {
    fontSize: 6.5,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  metaValue: { fontFamily: "Helvetica-Bold", color: COLORS.primary, fontSize: 10 },


  // Section title
  sectionTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: COLORS.primary,
    marginBottom: 4,
  },


  // Generic table grid
  tableRow: { flexDirection: "row" },
  tableHeaderCell: {
    backgroundColor: "#f8fafc",
    color: COLORS.textMuted,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    padding: 4,
    fontSize: 6.5,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  tableCell: {
    borderWidth: 0.5,
    borderColor: COLORS.border,
    padding: 5,
    fontSize: 8.5,
  },


  // Badge
  badge: {
    alignSelf: "flex-start",
    borderRadius: 3,
    paddingVertical: 1.5,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
  },


  summaryRow: { backgroundColor: COLORS.rowAlt },
  summaryText: { fontFamily: "Helvetica-Bold" },


  // Info bar
  infoTable: {
    flexDirection: "row",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.border,
    backgroundColor: "#fafafa",
    marginBottom: 12,
  },
  infoCell: { flex: 1, padding: 6, fontSize: 8 },
  infoLabel: { fontFamily: "Helvetica-Bold" },


  // Remarks
  remarksRow: { flexDirection: "row", gap: 10 },
  remarkCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 8,
  },
  remarkText: {
    fontStyle: "italic",
    fontSize: 8.5,
    marginVertical: 6,
    minHeight: 26,
  },
  remarkName: { fontSize: 8, marginBottom: 6 },
  sigRow: { flexDirection: "row", fontSize: 7.5, marginTop: 4 },
  sigCell: { flex: 1, flexDirection: "row", alignItems: "flex-end" },
  sigLine: {
    flex: 1,
    borderBottomWidth: 0.75,
    borderBottomColor: "#94a3b8",
    borderBottomStyle: "dashed",
    marginLeft: 4,
    height: 8,
  },
});


// ---------- Small building blocks ----------


const Badge = ({ code, slug }: { code: string; slug: string }) => {
  const c = badgeColor(slug);
  return (
    <Text style={[styles.badge, { backgroundColor: c.bg, color: c.fg }]}>
      {code}
    </Text>
  );
};


// ---------- Main component ----------


export function AssessmentReportCBC({ data }: { data: AssessmentReportData }) {
  const {
    school,
    student,
    exam,
    performance_levels,
    subjects,
    summary,
    term,
    financials,
    remarks,
  } = data;


  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.pageBorderOuter}>
          <View style={styles.pageBorderInner}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logoBox}>
                {school.logo_url ? (
                  <Image src={school.logo_url} style={styles.logoImage} />
                ) : (
                  <View style={styles.logoCircle}>
                    <Text style={styles.logoCircleText}>{school.initials}</Text>
                  </View>
                )}
              </View>
              <View style={styles.schoolInfo}>
                <Text style={styles.schoolTitle}>{school.name}</Text>
                <Text style={styles.schoolAddress}>
                  PO Box: {school.box_number}, {school.location}
                </Text>
                <Text style={styles.reportTitle}>
                  Assessment Report — {exam.term_title}
                </Text>
              </View>
              <View style={styles.logoBox} />
            </View>


            {/* Student metadata */}
            <View style={styles.metaTable}>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Student Name</Text>
                <Text style={styles.metaValue}>{student.name}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Admission No.</Text>
                <Text style={styles.metaValue}>{student.admission_number}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Grade</Text>
                <Text style={styles.metaValue}>{student.grade}</Text>
              </View>
            </View>


            {/* Performance level key */}
            <Text style={styles.sectionTitle}>
              Performance Level Key (4-Level Scale)
            </Text>
            <View style={{ marginBottom: 12 }}>
              <View style={styles.tableRow}>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Code</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>
                  Performance Level
                </Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>
                  Score Range
                </Text>
              </View>
              {performance_levels.map((lvl, i) => (
                <View style={styles.tableRow} key={i}>
                  <View style={[styles.tableCell, { flex: 1, alignItems: "center" }]}>
                    <Badge code={lvl.code} slug={lvl.code_slug} />
                  </View>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{lvl.name}</Text>
                  <Text
                    style={[styles.tableCell, { flex: 1, textAlign: "center" }]}
                  >
                    {lvl.range}
                  </Text>
                </View>
              ))}
            </View>


            {/* Scores table */}
            <View style={{ marginBottom: 12 }}>
              <View style={styles.tableRow}>
                <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: "left" }]}>
                  Learning Area
                </Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Score</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Level</Text>
                <Text style={[styles.tableHeaderCell, { flex: 3, textAlign: "left" }]}>
                  Description
                </Text>
              </View>
              {subjects.map((s, i) => (
                <View style={styles.tableRow} key={i}>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{s.name}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: "center" }]}>
                    {s.score}
                  </Text>
                  <View style={[styles.tableCell, { flex: 1, alignItems: "center" }]}>
                    <Badge code={s.level_code} slug={s.level_slug} />
                  </View>
                  <Text style={[styles.tableCell, { flex: 3 }]}>
                    {s.level_description}
                  </Text>
                </View>
              ))}
              <View style={[styles.tableRow, styles.summaryRow]}>
                <Text style={[styles.tableCell, styles.summaryText, { flex: 2 }]}>
                  TOTAL SCORE
                </Text>
                <Text
                  style={[
                    styles.tableCell,
                    styles.summaryText,
                    { flex: 1, textAlign: "center" },
                  ]}
                >
                  {summary.total_score}
                </Text>
                <Text style={[styles.tableCell, styles.summaryText, { flex: 4 }]}>
                  Overall Level: {summary.overall_level_code} -{" "}
                  {summary.overall_level_name}
                </Text>
              </View>
            </View>


            {/* Term dates & fees */}
            <View style={styles.infoTable}>
              <View style={styles.infoCell}>
                <Text>
                  <Text style={styles.infoLabel}>Closes: </Text>
                  {term.closing_date}
                </Text>
              </View>
              <View style={styles.infoCell}>
                <Text>
                  <Text style={styles.infoLabel}>Opens: </Text>
                  {term.opening_date}
                </Text>
              </View>
              <View style={styles.infoCell}>
                <Text>
                  <Text style={styles.infoLabel}>Fee Balance: </Text>
                  {financials.fee_balance}
                </Text>
              </View>
              <View style={styles.infoCell}>
                <Text>
                  <Text style={styles.infoLabel}>Next Fee: </Text>
                  {financials.next_term_fee}
                </Text>
              </View>
            </View>


            {/* Remarks & signatures */}
            <View style={styles.remarksRow}>
              <View style={styles.remarkCard}>
                <Text style={styles.sectionTitle}>
                  Grade Class Teacher&apos;s Remark
                </Text>
                <Text style={styles.remarkText}>&quot;{remarks.teacher.text}&quot;</Text>
                <Text style={styles.remarkName}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>Name: </Text>
                  {remarks.teacher.name}
                </Text>
                <View style={styles.sigRow}>
                  <View style={styles.sigCell}>
                    <Text>Sign:</Text>
                    <View style={styles.sigLine} />
                  </View>
                  <View style={styles.sigCell}>
                    <Text>Date:</Text>
                    <View style={styles.sigLine} />
                  </View>
                </View>
              </View>


              <View style={styles.remarkCard}>
                <Text style={styles.sectionTitle}>Principal&apos;s Remark</Text>
                <Text style={styles.remarkText}>&quot;{remarks.principal.text}&quot;</Text>
                <Text style={styles.remarkName}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>Name: </Text>
                  {remarks.principal.name}
                </Text>
                <View style={styles.sigRow}>
                  <View style={styles.sigCell}>
                    <Text>Sign:</Text>
                    <View style={styles.sigLine} />
                  </View>
                  <View style={styles.sigCell}>
                    <Text>Date:</Text>
                    <View style={styles.sigLine} />
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}


export default AssessmentReportCBC;