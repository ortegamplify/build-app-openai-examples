import { DomainEvent } from '../../../../shared/domain/DomainEvent';

export class AssistantReplied implements DomainEvent {
  readonly aggregateType = 'Conversation';
  readonly eventType = 'AssistantReplied';
  readonly eventVersion = 1;

  constructor(
    readonly aggregateId: string,
    readonly messageId: string,
    readonly assistantMessage: string,
    readonly occurredAt: Date = new Date(),
  ) {}
}
