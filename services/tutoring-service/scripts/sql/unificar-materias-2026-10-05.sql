-- Unifica materias duplicadas (decisión del DECE 2026-10-05):
--   MATEMÁTICA  → MATEMÁTICAS
--   Mod Soldadura → MOD. SOLDADURA (también "Mod. Soldadura")
-- Si un docente tenía la misma materia+nivel con ambos nombres, las asignaciones se fusionan
-- (se suman los paralelos y se mueven su horario y sus tutorías). Todo en una transacción.
BEGIN;
CREATE TEMP TABLE m(old text, tgt text);
INSERT INTO m VALUES
  ('33dc0ab3-7a8a-4dea-b332-dfeb809632a2', 'cb54a723-6482-445c-b92a-83655db441ea'), -- MATEMÁTICA → Matemáticas
  ('b0ae0c41-f706-4e83-82a8-e2e3488c599c', 'fc8b97d2-1233-4ca5-8aed-b0b08a6d51d6'); -- Mod Soldadura → Mod. Soldadura

CREATE TEMP TABLE dup AS
SELECT a.id AS old_id, b.id AS new_id
FROM teacher_assignments a
JOIN m ON a."subjectId" = m.old
JOIN teacher_assignments b ON b."subjectId" = m.tgt AND b."teacherId" = a."teacherId"
  AND b."levelId" = a."levelId" AND b."academicPeriodId" = a."academicPeriodId";

INSERT INTO teacher_assignment_parallels
SELECT d.new_id, p."parallelId" FROM teacher_assignment_parallels p JOIN dup d ON d.old_id = p."teacherAssignmentId"
ON CONFLICT DO NOTHING;
UPDATE teacher_availability_rules r SET "teacherAssignmentId" = d.new_id FROM dup d WHERE r."teacherAssignmentId" = d.old_id;
UPDATE tutoring_sessions s SET "teacherAssignmentId" = d.new_id FROM dup d WHERE s."teacherAssignmentId" = d.old_id;
DELETE FROM teacher_assignments WHERE id IN (SELECT old_id FROM dup);

UPDATE teacher_assignments a SET "subjectId" = m.tgt, "updatedAt" = now() FROM m WHERE a."subjectId" = m.old;
UPDATE tutoring_sessions s SET "subjectId" = m.tgt FROM m WHERE s."subjectId" = m.old;
DELETE FROM subjects WHERE id IN (SELECT old FROM m);

UPDATE subjects SET name = 'MATEMÁTICAS', "updatedAt" = now() WHERE id = 'cb54a723-6482-445c-b92a-83655db441ea';
UPDATE subjects SET name = 'MOD. SOLDADURA', "updatedAt" = now() WHERE id = 'fc8b97d2-1233-4ca5-8aed-b0b08a6d51d6';

SELECT s.name, count(a.*) AS asignaciones
FROM subjects s LEFT JOIN teacher_assignments a ON a."subjectId" = s.id
WHERE s.name ILIKE '%matem%' OR s.name ILIKE '%soldadura%'
GROUP BY 1;
COMMIT;
