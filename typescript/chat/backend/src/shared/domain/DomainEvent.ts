export interface DomainEvent {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  occurredAt: Date;
  eventVersion: number;
}
