import { UniqueId } from '../../../shared/domain/UniqueId';

export class ConversationId {
  private readonly value: string;

  static create(): ConversationId {
    return new ConversationId(new UniqueId().getValue());
  }

  static fromPrimitive(value: any): ConversationId {
    ConversationId.ensureConversationIdIsValid(value);
    return new ConversationId(value);
  }

  static ensureConversationIdIsValid(value: any): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error('ConversationId must be a non-empty string');
    }
  }

  private constructor(value: string) {
    this.value = value;
  }

  getValue(): string {
    return this.value;
  }

  toPrimitive(): string {
    return this.value;
  }

  equals(other: ConversationId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
