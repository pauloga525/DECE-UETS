# Casos de uso — Fase 0

Uno por cada flujo del plan (sección 6) y por cada regla de negocio (sección 4) que requiere lógica de aplicación, no solo un constraint de esquema. Sirven de contrato entre el modelo de datos (`backend/prisma/schema.prisma`) y los servicios que se construyen en cada fase.

## CU-01 · Declarar disponibilidad recurrente (Docente) — Fase 2
**Cambio de lógica post-plan (pedido explícito de Paulo, no en el documento original):** el horario ya no es genérico por docente — el docente lo registra **por cada `TeacherAssignment`** (materia+nivel) que atiende. Un docente de Matemáticas y Lengua declara un patrón semanal (día + hora inicio + hora fin) distinto para cada combinación, no uno solo. El sistema valida que el rango sea múltiplo de 40 minutos y que no se cruce con otro horario ya declarado por el mismo docente físico (en cualquiera de sus asignaciones), y lo guarda como `TeacherAvailabilityRule` colgando de esa `TeacherAssignment`. No crea bloques todavía — eso lo hace el worker `AvailabilityGenerator` de forma asíncrona.

## CU-02 · Proyectar disponibilidad en bloques (worker) — Fase 2
Job en segundo plano que, para cada `TeacherAvailabilityRule` activa, genera `TutoringSession(status=AVAILABLE)` de 40 minutos hacia adelante (mes a mes), heredando materia y nivel de la `TeacherAssignment` de la regla — el bloque generado ya nace con materia/nivel fijos, nunca en blanco. No duplica bloques ya proyectados para la misma fecha/docente/horario.

## CU-03 · Crear tutoría (DECE) — Fase 2
**Flujo guiado de 5 pasos** (antes 6 — el paso "materia y nivel" desapareció con CU-01/CU-02): fecha → docente → bloque disponible (ya con materia+nivel visibles) → paralelo + estudiantes (máx. 5) + motivo → confirmar. El DECE nunca elige materia ni nivel: vienen fijos en el bloque desde que se generó. En la confirmación, dentro de una transacción con `SELECT ... FOR UPDATE` sobre la sesión: valida estado `AVAILABLE`, capacidad, que el paralelo pertenezca al nivel del bloque, y solape de cada estudiante (regla 7); si todo pasa, pasa la sesión a `SCHEDULED` e inserta las `TutoringEnrollment`.

## CU-04 · Inscribir estudiante en bloque existente (DECE) — Fase 2/3
Igual validación transaccional que CU-03 pero sobre una sesión ya `SCHEDULED`. Si la sesión está en 5/5, ofrece agregar a `Waitlist` en lugar de bloquear la operación.

## CU-05 · Iniciar y finalizar tutoría (Docente) — Fase 3
El docente marca `IN_PROGRESS` al iniciar. Durante el bloque no puede cambiarse materia/nivel (regla 4). Al finalizar, debe registrar `Attendance` (Presente/Ausente/Justificado) para cada `TutoringEnrollment`; solo entonces la sesión pasa a `COMPLETED`.

## CU-06 · Cancelar tutoría (DECE/Docente) — Fase 3
Cambia `TutoringSession.status` a `CANCELLED` con motivo obligatorio, usuario y fecha (regla 14 — no se borra el registro). Dispara el webhook `SESSION_CANCELLED` (Fase 4) hacia los estudiantes inscritos.

## CU-07 · Reprogramar tutoría (DECE) — Fase 3
Mueve una sesión a otra fecha/bloque repitiendo **todas** las validaciones de CU-03 (regla 13): el bloque destino debe tener exactamente la misma materia y nivel que el original (cada bloque ya trae los suyos fijos — no se "cambian" al reprogramar), capacidad suficiente, y que ningún estudiante inscrito tenga conflicto en el nuevo horario.

## CU-08 · Promoción automática de lista de espera — Fase 3
Al cancelarse una `TutoringEnrollment` en una sesión con `Waitlist`, el primer estudiante en `position` pasa automáticamente a `ENROLLED` y su entrada de waitlist a `PROMOTED`. Notifica al DECE (Fase 4).

## CU-09 · Asignar docente a materia+nivel (Admin) — Fase 1
Crea `TeacherAssignment` validando unicidad (docente+materia+nivel+período — regla 5). Sin esta asignación, el docente no tiene sobre qué colgar una `TeacherAvailabilityRule` (CU-01) ni, por lo tanto, ningún bloque le aparecerá al DECE en CU-03.

## CU-10 · Auditoría de cambios — Todas las fases desde Fase 1
Cada mutación sobre una entidad sensible (tutoría, inscripción, asignación, contraseña, sesión) escribe una fila en `AuditLog` con usuario, acción, entidad, valor anterior y nuevo, dentro de la misma transacción de negocio. La tabla es insert-only a nivel de permisos de base de datos (regla 15).

## CU-11 · Login, logout y autorización por rol — Fase 1
Login autentica con email+password y emite un JWT con `role` y `tokenVersion` (`tv`) embebidos. Cada endpoint declara los roles permitidos vía `@Roles()`; sin ese decorador, cualquier usuario autenticado puede acceder. El frontend solo oculta opciones — la autorización real vive en `RolesGuard` (backend). Como el JWT es sin estado, `JwtStrategy` compara `tv` contra el valor actual en la base en cada request: **logout**, **reset de contraseña** (CU-12) y desactivar un usuario incrementan `tokenVersion`, lo que invalida de inmediato todo token ya emitido para ese usuario — sin esto, ninguna de esas tres acciones tendría efecto hasta que el token expirara solo (hasta 8h después).

## CU-12 · Restablecer contraseña (Admin) — post-MVP
No hay recuperación por correo (depende de Fase 4, no construida). Un Admin fija una contraseña nueva para cualquier usuario vía `PATCH /users/:id/reset-password`; la anterior deja de servir de inmediato (ver CU-11).
