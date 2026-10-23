import { IsId } from '../../../common/is-id.validator';

export class RescheduleSessionDto {
  /** id de un TutoringSession en estado AVAILABLE que recibirá la tutoría. */
  @IsId()
  newSessionId!: string;
}
