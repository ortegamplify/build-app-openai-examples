import { DomainEvent } from '../../../../shared/domain/DomainEvent';
import { Role } from '../Role';

export class MessageAdded implements DomainEvent {
  readonly aggregateType = 'Conversation';
  readonly eventType = 'MessageAdded';
  readonly eventVersion = 1;

  constructor(
    readonly aggregateId: string,
    readonly messageId: string,
    readonly role: Role,
    readonly content: string,
    readonly occurredAt: Date = new Date(),
  ) {}
}
