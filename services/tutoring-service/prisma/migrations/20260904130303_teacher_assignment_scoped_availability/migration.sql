/*
  Warnings:

  - You are about to drop the column `academicPeriodId` on the `teacher_availability_rules` table. All the data in the column will be lost.
  - You are about to drop the column `teacherId` on the `teacher_availability_rules` table. All the data in the column will be lost.
  - Added the required column `teacherAssignmentId` to the `teacher_availability_rules` table without a default value. This is not possible if the table is not empty.
  - Added the required column `teacherAssignmentId` to the `tutoring_sessions` table without a default value. This is not possible if the table is not empty.
  - Made the column `subjectId` on table `tutoring_sessions` required. This step will fail if there are existing NULL values in that column.
  - Made the column `levelId` on table `tutoring_sessions` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "teacher_availability_rules" DROP CONSTRAINT "teacher_availability_rules_academicPeriodId_fkey";

-- DropForeignKey
ALTER TABLE "teacher_availability_rules" DROP CONSTRAINT "teacher_availability_rules_teacherId_fkey";

-- DropIndex
DROP INDEX "teacher_availability_rules_teacherId_academicPeriodId_dayOf_idx";

-- AlterTable
ALTER TABLE "teacher_availability_rules" DROP COLUMN "academicPeriodId",
DROP COLUMN "teacherId",
ADD COLUMN     "teacherAssignmentId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tutoring_sessions" ADD COLUMN     "teacherAssignmentId" TEXT NOT NULL,
ALTER COLUMN "subjectId" SET NOT NULL,
ALTER COLUMN "levelId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "teacher_availability_rules_teacherAssignmentId_dayOfWeek_idx" ON "teacher_availability_rules"("teacherAssignmentId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "teacher_availability_rules" ADD CONSTRAINT "teacher_availability_rules_teacherAssignmentId_fkey" FOREIGN KEY ("teacherAssignmentId") REFERENCES "teacher_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutoring_sessions" ADD CONSTRAINT "tutoring_sessions_teacherAssignmentId_fkey" FOREIGN KEY ("teacherAssignmentId") REFERENCES "teacher_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
