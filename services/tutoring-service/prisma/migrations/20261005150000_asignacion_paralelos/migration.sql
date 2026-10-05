-- Paralelos de cada asignación docente-materia-nivel (carga de docentes 2026-10-05).
CREATE TABLE "teacher_assignment_parallels" (
    "teacherAssignmentId" TEXT NOT NULL,
    "parallelId" TEXT NOT NULL,
    CONSTRAINT "teacher_assignment_parallels_pkey" PRIMARY KEY ("teacherAssignmentId","parallelId")
);
CREATE INDEX "teacher_assignment_parallels_parallelId_idx" ON "teacher_assignment_parallels"("parallelId");
ALTER TABLE "teacher_assignment_parallels" ADD CONSTRAINT "teacher_assignment_parallels_teacherAssignmentId_fkey"
    FOREIGN KEY ("teacherAssignmentId") REFERENCES "teacher_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_assignment_parallels" ADD CONSTRAINT "teacher_assignment_parallels_parallelId_fkey"
    FOREIGN KEY ("parallelId") REFERENCES "parallels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
