import { IsUUID } from 'class-validator';

export class RescheduleSessionDto {
  /** id de un TutoringSession en estado AVAILABLE que recibirá la tutoría. */
  @IsUUID()
  newSessionId!: string;
}
