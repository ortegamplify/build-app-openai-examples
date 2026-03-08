import { DomainEvent } from '../../../../shared/domain/DomainEvent';

export class ConversationCreated implements DomainEvent {
  readonly aggregateType = 'Conversation';
  readonly eventType = 'ConversationCreated';
  readonly eventVersion = 1;

  constructor(
    readonly aggregateId: string,
    readonly occurredAt: Date = new Date(),
    readonly title: string = 'New Conversation',
  ) {}
}
