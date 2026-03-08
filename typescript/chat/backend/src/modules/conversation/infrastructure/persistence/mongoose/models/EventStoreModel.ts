import mongoose from 'mongoose';

const eventStoreSchema = new mongoose.Schema(
  {
    aggregateId: { type: String, required: true, index: true },
    aggregateType: { type: String, required: true },
    eventType: { type: String, required: true },
    eventVersion: { type: Number, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    occurredAt: { type: Date, default: Date.now, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'domain_events' },
);

// Compound index for efficient event retrieval
eventStoreSchema.index({ aggregateId: 1, occurredAt: 1 });

export const EventStoreModel = mongoose.model(
  'EventStore',
  eventStoreSchema,
);
