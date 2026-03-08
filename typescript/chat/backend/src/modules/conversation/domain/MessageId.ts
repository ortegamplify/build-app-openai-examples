import { UniqueId } from '../../../shared/domain/UniqueId';

export class MessageId {
  private readonly value: string;

  static create(): MessageId {
    return new MessageId(new UniqueId().getValue());
  }

  static fromPrimitive(value: any): MessageId {
    MessageId.ensureMessageIdIsValid(value);
    return new MessageId(value);
  }

  static ensureMessageIdIsValid(value: any): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error('MessageId must be a non-empty string');
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

  equals(other: MessageId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
