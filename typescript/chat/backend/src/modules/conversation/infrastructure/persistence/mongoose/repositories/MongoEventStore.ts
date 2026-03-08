import { injectable } from 'tsyringe';
import { EventStore } from '../../../../domain/EventStore';
import { DomainEvent } from '../../../../../../shared/domain/DomainEvent';
import { EventStoreModel } from '../models/EventStoreModel';

@injectable()
export class MongoEventStore implements EventStore {
  async saveEvents(aggregateId: string, events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    const eventDocs = events.map((event) => ({
      aggregateId,
      aggregateType: event.aggregateType,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      payload: event,
      occurredAt: event.occurredAt,
    }));
    await EventStoreModel.insertMany(eventDocs);
  }

  async getEventsByAggregateId(aggregateId: string): Promise<DomainEvent[]> {
    const docs = await EventStoreModel.find({ aggregateId }).sort({ occurredAt: 1 });
    return docs.map((doc) => doc.payload as DomainEvent);
  }

  async getAllEvents(): Promise<DomainEvent[]> {
    const docs = await EventStoreModel.find().sort({ occurredAt: 1 });
    return docs.map((doc) => doc.payload as DomainEvent);
  }
}
