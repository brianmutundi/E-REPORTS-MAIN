# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

E-REPORTS is a multi-tenant school academic reporting and examination management application built with Next.js, React, TypeScript, and Supabase.

The current application covers:

- Authentication and password recovery
- School/tenant profiles
- Classes
- Learning Areas / Subjects
- Students
- Examinations and exam-class / exam-subject assignment
- Marks entry
- Grading scales
- Results
- Report templates
- Report-template configuration
- Teacher and principal remarks configuration
- Report PDF generation
- Super-admin access

The application uses Supabase Auth for identity and PostgreSQL/RLS for data isolation. Tenant-owned records must remain isolated by `tenant_id`.

Do not treat this as a generic CRUD application. Academic history, marks, results, report templates, and tenant boundaries are business-critical data and changes must preserve existing records and relationships.

## Technology Stack

- Next.js `15.5.x`
- React `19.x`
- TypeScript `5.9.x`
- Supabase JS `2.x`
- `@supabase/ssr` for browser/server authentication sessions
- Tailwind CSS `3.4.x`
- Lucide React for icons
- `@react-pdf/renderer` for PDF/report rendering
- ESLint 9

## Commands

Run from the repository root:

```bash
npm run dev
npm run build
npm start
npm run typecheck
npm run lint
```

On Windows PowerShell / Command Prompt, use the commands exactly as above. If Node/npm is unavailable, fix the local Node.js/PATH installation rather than changing project scripts.

Before declaring a change complete, normally run:

```bash
npm run typecheck
npm run lint
npm run build
```

If a command cannot be run because the required external service or environment variable is unavailable, report that explicitly rather than claiming the check passed.

## Architecture

```text
app/
├── admin/                         # Admin layout area
├── api/
│   └── reports/pdf/               # Report PDF endpoint
├── dashboard/
│   ├── classes/                   # Classes / grades
│   ├── examinations/              # Exams and exam assignment
│   ├── grading/                   # Grading-scale management
│   ├── marks/                     # Marks entry
│   ├── reports/                   # Reports and templates
│   │   └── template/
│   │       └── configuration/    # Report configuration
│   ├── results/                   # Results
│   ├── settings/                  # School/application settings
│   ├── students/                  # Student directory
│   ├── subjects/                  # Learning Areas
│   └── page.tsx                   # Dashboard home
├── forgot-password/               # Password recovery
├── login/                         # Login
├── reset-password/                # Password reset
├── super-admin/
│   └── dashboard/                # Super-admin dashboard/actions
├── globals.css
└── layout.tsx

components/
├── PrintButton.tsx
├── Sidebar.tsx
└── SignOutButton.tsx

lib/
├── grading.ts                     # Grading calculations/helpers
├── report-template.ts             # Report-template helpers
├── results.ts                     # Results calculations/helpers
└── supabase/
    ├── admin.ts                   # Service-role server client
    ├── client.ts                  # Browser Supabase client
    └── server.ts                  # Server Supabase client

supabase/
└── migrations/                    # Ordered PostgreSQL migrations

public/
└── e-reports-app-icon.svg
```

## Supabase Client Rules

There are three Supabase client patterns in this repository:

### Browser client

Use `lib/supabase/client.ts` for client components that need Supabase browser access.

### Server client

Use `lib/supabase/server.ts` for Server Components, server-side application code, and authenticated server operations that should run with the user's Supabase session.

### Admin/service-role client

`lib/supabase/admin.ts` creates a service-role client using `SUPABASE_SERVICE_ROLE_KEY`.

**Never expose the service-role key to client-side code.** Do not import the admin client into a Client Component. Service-role operations bypass normal RLS protections and therefore require deliberate server-only use.

## Authentication and Routing

`middleware.ts` protects:

- `/dashboard/:path*`
- `/super-admin/:path*`
- `/login`
- `/forgot-password`

The current profile model uses:

- `super_admin` — global role; `tenant_id` must be null
- `admin` — school/tenant administrator; `tenant_id` must be non-null

Current middleware behavior:

- Unauthenticated protected-route access redirects to `/login`.
- Users without a profile role are redirected to `/login` for protected routes.
- `super_admin` users are restricted to `/super-admin` routes and redirected away from `/dashboard`.
- `admin` users are restricted to `/dashboard` routes and redirected away from `/super-admin`.
- Authenticated users visiting login/forgot-password are redirected to their appropriate dashboard when their role is known.

Do not weaken these checks merely to make a page render. Authorization must be enforced at the database/RLS layer as well as the application-routing layer.

## Multi-Tenant Security

The central tenant boundary is `tenant_id`.

Tenant-owned tables currently include:

- `classes`
- `subjects`
- `students`
- `exams`
- `marks`
- `report_templates`
- `grading_scales`
- `report_template_configs`
- `report_grading_levels`
- `report_teacher_remarks`
- `report_principal_remarks`

The database provides `public.my_tenant_id()` to resolve the authenticated user's tenant from `profiles`.

RLS is enabled on tenant-owned tables. Policies generally use `tenant_id = public.my_tenant_id()` and, where relationships cross tables, additionally verify that referenced records belong to the same tenant.

For example, exam-class, exam-subject, and mark relationships must not permit cross-tenant references.

### Non-negotiable tenant rules

1. Never trust a client-supplied `tenant_id` for authorization.
2. Never query tenant data without an appropriate tenant boundary.
3. Never allow a user to change their own role or tenant scope.
4. Never use a global query to update/delete another school's records.
5. Foreign-key relationships between tenant-owned entities must be checked for tenant consistency.
6. Preserve and strengthen RLS when adding tables.
7. Any new tenant-owned table should have `tenant_id`, an appropriate foreign key to `tenants`, RLS enabled, and tenant-scoped policies unless there is a documented reason otherwise.

## Database Schema

The current migration history establishes these core entities.

### Tenants and profiles

`tenants` represents schools/tenants.

`profiles` references `auth.users(id)` and stores:

- `full_name`
- `role`
- `tenant_id`

Role/scope integrity is enforced so a `super_admin` has no tenant and an `admin` must belong to a tenant.

A database trigger prevents an authenticated user from changing their own `role` or `tenant_id`.

### Academic entities

`classes` belong to a tenant and have unique names within that tenant.

`subjects` belong to a tenant and have unique names within that tenant. They may also have a curriculum `code`.

`students` belong to a tenant and have a unique admission number within that tenant. A student may reference a class.

### Examinations

`exams` belong to a tenant and currently contain:

- name
- term
- academic year
- status (`draft` or `published`)

`exam_classes` associates exams with classes (grades) — the assessment → grade cascade.

`exam_subjects` associates exams with subjects (learning areas) exam-wide.

`exam_class_subjects` associates an exam, a class AND a subject together. It is the single authoritative scope for the Assessment → Grade → Learning Area cascade: a learning area is only in scope for a grade when a row exists for that (exam, class, subject) triple. `exam_class_subjects` is backfilled at migration time from the cross product of `exam_classes` × `exam_subjects`, and the app consumes it (marks entry, import, results, reports, analysis) via `lib/scope.ts` — not `exam_subjects`.

All three association tables are tenant-hardened by verifying every side of the relationship belongs to the current tenant.

### Marks

`marks` contains:

- tenant
- exam
- student
- subject
- score
- created/updated timestamps

Scores must be between 0 and 100.

A mark is uniquely identified by the exam/student/subject combination, with a tenant-aware uniqueness constraint also present in the migration history.

Do not silently overwrite marks or create duplicate mark records.

### Grading

`grading_scales` belongs to a tenant and defines:

- grade
- minimum score
- maximum score
- description
- sort order

The score range is constrained to 0–100 and minimum must not exceed maximum.

### Report templates

`report_templates` belongs to a tenant and contains JSON template configuration.

Only one template may be the default for a tenant. This is enforced with a partial unique index.

Related configuration tables include:

- `report_template_configs`
- `report_grading_levels`
- `report_teacher_remarks`
- `report_principal_remarks`

The report configuration validator currently requires 4–8 grading levels, 4–8 teacher remarks, and 4–8 principal remarks, and rejects overlapping grading ranges.

## Migration Rules

Supabase migrations are the source of truth for database structure.

Current migrations are timestamped and ordered. Add a new migration rather than editing an already-applied migration in a way that would make environments diverge.

Before writing a migration:

1. Inspect the existing schema and migration history.
2. Check whether the table, column, constraint, index, function, policy, or trigger already exists.
3. Use `if exists` / `if not exists` where appropriate for safe repeatability.
4. Preserve existing data.
5. Consider foreign keys and dependent records.
6. Consider RLS policies and authenticated access.
7. Validate tenant isolation.
8. Add indexes where new tenant-scoped or relationship queries require them.

### Never

- Drop production data to solve an application bug.
- Reset tables just because test data is inconvenient.
- Remove historical marks/results to make a migration pass.
- Disable RLS as a workaround.
- Replace a failed constraint with an unrestricted schema.
- Change an applied migration simply because it is easier than creating a corrective migration.

If a destructive operation is genuinely required, stop and explain the data implications before implementing it.

## Application Coding Rules

### Next.js

Use the App Router conventions already present in the repository.

Be explicit about Server Components versus Client Components.

Do not pass ordinary server functions/actions directly to Client Components unless they are correctly exposed as Server Actions with `"use server"` and the usage matches Next.js requirements.

Do not call render-time APIs such as `revalidatePath` from a component render path. Perform cache invalidation from an appropriate server mutation/action context.

### Server/client boundary

Keep database and authorization-sensitive operations on the server whenever possible.

Client Components should receive the minimum data and capabilities necessary for their UI behavior.

Do not move service-role operations into browser code to bypass RLS or fix authorization errors.

### TypeScript

Keep strict typing intact. Avoid `any` unless there is a documented, unavoidable boundary.

Prefer explicit types for Supabase query results, form data, and API payloads.

Do not silence TypeScript errors with casts merely to get a build green if the underlying type/model is wrong.

## Academic Data Integrity

Academic data is historical and should be treated as durable records.

When changing classes, exams, marks, grading, or reports:

- Preserve existing marks and results.
- Respect exam status and publication behavior already implemented by the application.
- Do not silently change historical academic-year or term values.
- Do not duplicate marks when editing an existing entry.
- Do not delete referenced academic records simply because a UI action needs correction.
- Prefer explicit correction/edit/reversal workflows where appropriate.

If a class, subject, student, exam, or template has dependent records, inspect the dependency chain before implementing deletion.

## Report Generation

Report-related code is split between:

- `lib/report-template.ts`
- `lib/results.ts`
- `app/dashboard/reports/`
- `app/api/reports/pdf/route.tsx`

When changing report output, verify both the configuration UI and generated report/PDF behavior.

Do not assume that changing a display component automatically changes PDF output; inspect the PDF route separately.

Report template configuration must remain consistent with its database validation rules.

## UI / UX Conventions

The supplied E-REPORTS interface establishes the current visual direction:

- Slate/dark navigation shell
- Emerald primary actions and active navigation
- White content cards
- Light slate page backgrounds
- Compact academic/admin dashboard density
- Lucide icons
- Responsive desktop/mobile navigation
- Clear CRUD actions for Classes, Learning Areas, and Students

The sidebar currently exposes:

- Classes
- Learning Areas
- Students
- Marks Entry
- Results

Additional academic areas exist in the application, including Examinations, Grading, Reports, Report Templates, Settings, and Super Admin.

When adding UI, follow the existing visual language instead of introducing an unrelated component style.

Use accessible labels, sensible button states, confirmation for destructive actions, and useful empty/error states.

## CRUD Behavior

CRUD screens must distinguish between:

- Creating a new record
- Editing an existing record
- Deleting a record
- Deactivating/archiving where applicable
- Records that cannot safely be deleted because they have dependencies

Do not make a delete button appear to work if the database correctly rejects the operation. Surface a useful explanation and, where appropriate, provide a safe correction/archive workflow.

For edits, load the existing record and update only the intended fields. Do not recreate the record unless the data model explicitly requires it.

## Bulk Import — Students and Results

Bulk import is a first-class requirement of E-REPORTS and must be treated as a controlled academic-data ingestion workflow, not as a simple CSV upload.

The application must support bulk importing both **Students** and **Results/Marks**.

### Student bulk import

Provide a clear import workflow for adding many students at once. The minimum supported student spreadsheet/CSV identity fields are:

```text
Adm No, Name
```

Where the current student model requires additional academic placement information, the importer may support additional columns such as class/grade and stream/section, but it must inspect the existing schema and use the canonical enrollment/placement model rather than silently writing conflicting legacy fields.

Student import must:

1. Accept CSV and, where the project already supports it, spreadsheet formats.
2. Provide a downloadable/template example before import.
3. Normalize headers and whitespace while preserving the user's actual student data.
4. Match the admission number (`Adm No`) against the current tenant only.
5. Detect duplicate admission numbers within the upload before writing anything.
6. Detect admission numbers that already exist in the school and clearly distinguish existing students from new students.
7. Validate required names and any required class/enrollment fields.
8. Show a **preview/validation step before commit**.
9. Report row-level errors with row number, field, value and reason.
10. Allow correction/re-upload without creating partial duplicate students.
11. Use a transaction or equivalent all-or-safe-batch server operation where possible.
12. Never allow an import to cross the current user's tenant boundary.
13. Never silently overwrite an existing student's identity or historical enrollment.
14. Preserve historical academic records and canonical enrollment history.
15. Return an import summary: created, skipped, updated (only if explicitly supported), and failed rows.

### Results / Marks bulk import

Provide a bulk results import designed for teachers and administrators who need to enter an entire class/exam result set efficiently.

The core spreadsheet shape must support:

```text
Adm No, Name, Learning Area 1, Learning Area 2, Learning Area 3, ...
```

The learning-area columns represent the subjects/learning areas configured for the selected exam/class. For example:

```text
Adm No, Name, Mathematics, English Language, Integrated Science
ADM-1001, Jane Wanjiku, 78, 84, 69
ADM-1002, John Otieno, 65, 72, 81
```

The learning-area columns are **order-independent**. The importer must identify and align each column by its normalized header (learning-area name and/or configured code), not by column position. The file may place Mathematics before English, English before Mathematics, or any other order, and the marks must still map to the correct learning areas. `Adm No` and `Name` are the identifying columns; learning-area columns may appear in any order after them or elsewhere in the sheet if the header parser can identify them reliably.

**Important: this is a data-reading and alignment requirement, not merely an "order-independent" UI option.** The importer must read the uploaded header row as data, determine what each column represents, and dynamically build a column-to-learning-area mapping before reading/committing marks. For example, if the configured learning areas are `Mathematics`, `English Language`, and `Integrated Science`, then all of these must resolve correctly:

```text
Adm No | Name | Mathematics | English Language | Integrated Science
Adm No | Name | Integrated Science | Mathematics | English Language
Adm No | Name | English Language | Integrated Science | Mathematics
```

The implementation should conceptually produce a mapping such as:

```text
spreadsheet column 3 -> Mathematics -> internal learning_area_id X
spreadsheet column 4 -> English Language -> internal learning_area_id Y
spreadsheet column 5 -> Integrated Science -> internal learning_area_id Z
```

If the order changes, only the spreadsheet-column numbers change; the resolved internal learning-area IDs must remain the same. Never map marks using positional assumptions such as `subjects[0]`, `subjects[1]`, etc. The importer must first resolve headers, then use that mapping when extracting every student's mark.

The exact learning-area names/codes must be resolved against the current tenant's configured subjects. Do not create subjects automatically merely because an unknown spreadsheet column exists. Header matching should be tolerant of harmless differences such as leading/trailing whitespace and case, and should use the application's canonical learning-area name/code mapping. Ambiguous or unrecognized headers must be surfaced for correction rather than guessed.

Results import must require the user to select or otherwise establish the target academic context before committing data, including as applicable:

- School/tenant — derived from the authenticated user, never trusted from the file.
- Academic year.
- Term.
- Examination.
- Class/grade and stream where applicable.

Results import must:

1. Provide a downloadable import template generated from the selected class/exam/learning areas where practical.
2. Include `Adm No` and `Name` as identifying columns.
3. Treat `Adm No` as the authoritative student lookup key; do not identify students by name alone.
4. Use `Name` as a validation/display field and flag mismatches rather than silently assigning marks to a different student.
5. Resolve each learning-area column to an existing subject/learning area in the current tenant **by header identity, not by column position**.
6. Support learning-area columns in any order; never assume the spreadsheet order matches the school's configured order.
7. Normalize header text for matching (for example case and surrounding whitespace) while retaining the original header for error reporting.
8. Reject unknown, ambiguous or duplicate learning-area columns before commit.
9. Validate marks against the application's permitted score range and grading/business rules.
10. Detect duplicate student rows before writing.
11. Detect duplicate marks for the same exam/student/learning-area combination.
12. Never silently overwrite an existing mark. If replacement is supported, require an explicit user decision and preserve the appropriate audit/history behavior.
13. Validate that each student belongs to the selected class/enrollment context for the exam.
14. Respect exam-class and exam-subject assignment rules.
15. Preview all proposed changes before commit.
16. Provide row-level and cell-level validation errors.
17. Allow the user to download an error report containing rejected rows and reasons.
18. Commit only validated rows according to the chosen import policy; never leave an unexplained partially-written dataset.
19. Return a clear import summary showing inserted, skipped, rejected and conflicting records.
20. Recalculate/display results only through the canonical results/grading logic already used by manual entry.
21. Never trust `tenant_id`, student IDs, subject IDs or other authorization identifiers supplied by the spreadsheet.
### Import matching rules

- `Adm No` is the primary external identifier for student matching.
- `Name` is a human-readable verification field, not a safe substitute for admission number.
- Learning-area headers must resolve to the tenant's existing subjects by configured name/code mapping.
- Header matching should be tolerant of harmless whitespace/case differences, but ambiguous matches must stop the import.
- Do not guess between two possible subjects.
- Blank mark cells should follow an explicitly documented policy (for example, leave unchanged versus no mark); never invent a zero without the application's business rule requiring it.

### Import safety and transaction rules

Bulk import is a high-risk write operation. The implementation must separate:

```text
Upload file
    ↓
Parse
    ↓
Normalize headers/data
    ↓
Validate tenant/context
    ↓
Resolve students and learning areas
    ↓
Detect duplicates/conflicts
    ↓
Preview proposed changes
    ↓
User confirms
    ↓
Transactional server-side commit
    ↓
Re-read canonical records
    ↓
Show import summary/audit result
```

Do not implement a one-click client-side loop that performs hundreds of independent inserts without validation.

Imports must be auditable. Record enough metadata to determine who imported what, when, for which tenant and academic context, and whether the operation succeeded or produced rejected rows, using the existing audit conventions or a new tenant-scoped import/audit table where the current schema does not already provide one.

Service-role/admin database access may be used for a server-side import operation only when necessary, but every imported row must still be explicitly validated against the authenticated user's tenant and authorization context. Never expose the service-role key to the browser.

### Bulk import UI/UX

Use the E-REPORTS Operate mode. The import screen should make the workflow obvious:

1. **Choose context** — for results: exam, academic year, term, class/stream and applicable learning areas.
2. **Download template** — provide a correctly shaped CSV/template.
3. **Upload file** — drag/drop and file picker where appropriate.
4. **Validate** — show progress and do not write academic data during client-side parsing.
5. **Preview** — show valid rows, warnings and errors.
6. **Confirm import** — clearly state what will be created/changed and what will be rejected.
10. **Complete** — show counts and provide an error-file download when applicable.

Do not hide validation failures behind a generic "Import failed" message.

### Bulk import API/server rules

Prefer a dedicated server endpoint or server action for import orchestration. Keep parsing, validation, authorization and database writes on the server where they involve trusted identifiers or sensitive academic data.

The import implementation must:

- authenticate the request;
- derive the tenant from the authenticated session;
- authorize the requested academic context;
- validate file type and size;
- parse safely;
- validate headers;
- validate every row before commit;
- use parameterized/database-safe operations;
- avoid N+1 queries where a batched lookup is possible;
- use appropriate database transactions/RPCs for atomicity;
- return structured validation results suitable for the UI;
- avoid logging student data or marks unnecessarily.

### Bulk import acceptance tests

Before declaring bulk import complete, verify at minimum:

- valid student CSV imports successfully;
- duplicate admission numbers in the same file are rejected clearly;
- existing admission numbers are handled according to the explicit import policy;
- blank required names are rejected;
- valid results import against the correct exam/class;
- `Adm No` maps marks to the correct student;
- a mismatched `Name` produces a warning/error according to policy rather than a wrong student assignment;
- unknown learning-area columns are rejected before commit;
- duplicate learning-area columns are rejected;
- invalid/non-numeric/out-of-range marks are rejected;
- duplicate student rows are rejected;
- existing marks are never silently overwritten;
- students outside the selected class/enrollment are rejected;
- users cannot import another tenant's students or results;
- a failed validation produces no unintended academic writes;
- the final imported data appears correctly in Marks, Results and generated Reports;
- manual marks entry and imported marks use the same canonical grading/result calculations;
- import summary and audit information are accurate.

## Error Handling

User-facing errors should explain the actual problem without leaking secrets or raw database internals unnecessarily.

Server logs may contain technical details, but the UI should provide actionable messages such as:

- invalid/duplicate entry
- record has dependent data
- unauthorized action
- session expired
- missing configuration
- invalid score/range

When debugging a Supabase error, identify whether it is:

1. Authentication/session failure
2. Authorization/RLS failure
3. Schema/column mismatch
4. Constraint violation
5. Foreign-key/dependency violation
6. Application logic error
7. Client/server boundary error

Do not solve one category by weakening another category's protections.

## Environment Variables

The repository expects Supabase configuration including:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed through `NEXT_PUBLIC_*` variables or client-side code.

Use `.env.example` as the safe template. Do not commit real secrets.

## Verification Workflow

For a feature or bug fix:

1. Inspect the relevant page/component.
2. Inspect related server code and Supabase queries.
3. Inspect the database migration/schema if the issue involves data or authorization.
4. Trace the full request path rather than patching only the visible error.
5. Implement the smallest correct change.
6. Run typecheck.
7. Run lint.
8. Run build.
9. If database behavior changed, verify the relevant migration/RLS/constraint behavior.
10. Test the affected UI flow.
11. Check that unrelated tenants/users cannot access the changed data.

When reporting completion, distinguish between:

- implemented
- typechecked
- linted
- built
- database migration applied
- manually tested

Never claim a database migration was applied to a live Supabase project unless it was actually executed and verified.

## Git Workflow

Never push directly to `main`.

Use a feature/fix branch:

```bash
git checkout -b feat/<description>
# or
git checkout -b fix/<description>
```

Then:

```bash
git add .
git commit -m "<clear change description>"
git push -u origin <branch>
```

Create a pull request rather than pushing directly to `main`.

Keep commits focused. Do not mix unrelated refactors with a production bug fix unless necessary.

## Working Principle

The priority order when making changes is:

1. Data integrity
2. Tenant isolation and security
3. Correct authorization
4. Correct academic/business logic
5. Server/client architecture
6. Type safety
7. User experience
8. Visual polish

A UI that looks correct but bypasses RLS, corrupts academic records, or allows cross-school access is not considered correct.

When requirements conflict with the current implementation, inspect the existing code and database first, explain the conflict, and make the smallest safe architectural change.

## UI/UX Design — Impeccable

When working on frontend interfaces, use the repository's installed **Impeccable** design skill when available. It applies to dashboards, app shells, forms, settings, components, responsive layouts, accessibility, typography, spacing, color, motion, UX copy, error states, and design-system work.

### Design principles

- Go all out: deliver complete, production-grade UI rather than tentative or half-finished styling.
- Prefer distinctive, intentional design with a clear visual point of view.
- For operational school-management screens, prioritize scanability, consistency, native expectations, accessibility, and task completion over decorative effects.
- Preserve product truth, existing behavior, content, and constraints unless the requested work explicitly calls for redesign.
- Do not replace factual copy or invent product claims without a reason grounded in the task.
- Treat existing visual implementation as evidence of the incumbent design system; do not assume that a missing design document means the project is greenfield.

### UI modes

Choose the mode from the requested surface:

- **Persuade** — landing, marketing, pricing and campaign surfaces.
- **Operate** — dashboards, administration, settings, data entry, reports and other task-oriented school-management UI. This is the dominant E-REPORTS mode.
- **Read** — documentation, guides, help and long-form information.
- **Experience** — portfolios, galleries and showcase surfaces.

### Impeccable workflow

If the Impeccable skill is installed in the repository, follow its workflow before editing UI:

1. Run its context setup once per session, keeping the working directory at the project root:
   ```bash
   node .agents/skills/impeccable/scripts/context.mjs --target <path>
   ```
2. Load the playbook/reference that owns the requested design command before acting.
3. Inspect the target and at least one representative source of incumbent visual truth such as tokens, theme, CSS, components or assets.
4. Immediately before UI edits, load the skill's craft-floor guidance when available.
5. Build the complete requested surface.
6. Verify in bounded passes: inspect desktop and mobile together, fix the findings in one batch, then perform at most one confirmation pass. Avoid open-ended visual polishing loops.

Do not invent or substitute missing Impeccable reference files. If the skill is not installed, use the project's existing design system and the UI rules in this document.

### Impeccable command routing

When the user explicitly invokes one of these commands, follow the corresponding Impeccable reference if installed:

| Command | Purpose |
|---|---|
| `shape [feature]` | Plan UX/UI before implementation |
| `init` | Capture durable product context |
| `document` | Generate DESIGN.md from existing implementation |
| `extract [target]` | Extract reusable design tokens/components |
| `critique [target]` | UX/design review |
| `audit [target]` | Accessibility, performance and responsive audit |
| `polish [target]` | Final quality pass |
| `bolder [target]` | Increase visual impact |
| `quieter [target]` | Reduce visual intensity |
| `distill [target]` | Remove unnecessary complexity |
| `harden [target]` | Production-readiness pass for errors, edge cases and i18n |
| `onboard [target]` | First-run flows and empty states |
| `animate [target]` | Purposeful motion |
| `colorize [target]` | Strategic color |
| `typeset [target]` | Typography hierarchy |
| `layout [target]` | Spacing, rhythm and hierarchy |
| `delight [target]` | Personality and micro-interactions |
| `overdrive [target]` | Ambitious visual treatment |
| `clarify [target]` | UX copy, labels and errors |
| `adapt [target]` | Device and responsive adaptation |
| `optimize [target]` | UI performance |
| `live` | Browser-based visual iteration |

If no command is supplied, do not automatically run a design command merely because the task involves UI. Determine the requested scope first. For a narrow refinement, preserve the incumbent implementation; for a genuine new surface or replacement visual world, use the new-work workflow when available.

### E-REPORTS UI requirements

- Keep the interface suitable for Kenyan school administration workflows: clear labels, compact data presentation, predictable forms and efficient navigation.
- Use the existing E-REPORTS visual language unless a redesign is explicitly requested.
- Maintain responsive behavior for desktop, tablet and mobile.
- Use accessible labels, keyboard-friendly controls, visible focus states, appropriate contrast and meaningful empty/error/loading states.
- Use Lucide icons consistently rather than arbitrary icon glyphs.
- Do not use animation merely for decoration; motion must communicate state, hierarchy or feedback and must not interfere with data entry.
- Tables, marks-entry grids, student directories, fee/academic records and report configuration screens must favor density and scanability without sacrificing readability.
- Destructive academic/data actions must have clear confirmation and explain dependencies or consequences.

## Responsive Mobile + Laptop Requirements

E-REPORTS is a responsive web application intended for phones, tablets and laptops. Treat mobile and laptop layouts as first-class experiences, not a desktop layout squeezed into a smaller viewport. The supplied Mobile App Design Standards require platform-aware interaction, accessible touch targets, readable typography, strong contrast, consistent components, responsive feedback and performance-conscious interaction.

### Responsive interaction rules

- Design and test every user-facing surface at narrow mobile width, tablet width and laptop/desktop width.
- Interactive controls should provide at least a 44px-equivalent touch target; prefer 48px for primary controls. Keep at least 8px spacing between adjacent targets.
- Body text should normally be 16px or larger on mobile; do not create tiny controls or labels that require zooming.
- Maintain WCAG AA contrast: 4.5:1 for normal text, 3:1 for large text and 3:1 for UI component boundaries. Never communicate status by color alone.
- Mobile navigation should use a clear top bar and accessible drawer/sheet. The drawer must close after navigation and the backdrop must not make the page unusable.
- Do not rely on hover-only interactions. Every important action must work with touch and keyboard.
- Long tables, marks-entry grids and report data must remain usable on narrow screens. Prefer horizontal scrolling, responsive cards or purpose-built mobile views rather than shrinking text below readable sizes.
- Forms must use full-width inputs on phones, visible labels, clear validation and recovery messages, and appropriately sized controls.
- Preserve keyboard navigation, visible focus, semantic labels and screen-reader context.
- Provide skeleton/progress states for operations that take noticeable time, prevent layout shift, and give immediate interaction feedback. Aim for smooth 60fps motion and avoid unnecessary animation.

### E-REPORTS responsive priorities

1. **Mobile first:** student lists, marks entry, result review, forms and navigation must be practical with one-handed touch.
2. **Tablet:** use available width for efficient data entry without making controls excessively small.
3. **Laptop/desktop:** use the wider viewport for tables, side navigation and multi-column workflows.
4. **Shared logic:** responsive changes must not duplicate or fork business rules. Keep data fetching, validation, authorization and calculations independent of presentation.
5. **No horizontal page overflow:** individual data grids may scroll horizontally when necessary, but the overall application viewport must remain stable.
6. **Reduced motion:** all non-essential animation, including the login shimmer, must respect `prefers-reduced-motion`.

### Mobile QA checklist

Before declaring a UI feature complete, verify:

- [ ] Works at approximately 320px-390px phone widths.
- [ ] Works at tablet widths.
- [ ] Works at laptop/desktop widths.
- [ ] Primary controls are comfortably tappable.
- [ ] No clipped text or accidental page-level horizontal scrolling.
- [ ] Keyboard/focus navigation works.
- [ ] Labels and error messages remain readable.
- [ ] Tables/grids have a deliberate mobile presentation.
- [ ] Loading, empty and error states work on small screens.
- [ ] Motion is useful and reduced when requested by the operating system/browser.
