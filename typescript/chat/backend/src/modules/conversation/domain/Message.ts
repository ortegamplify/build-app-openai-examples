import { ValueObject } from '../../../shared/domain/ValueObject';
import { MessageId } from './MessageId';
import { Role } from './Role';

export class Message extends ValueObject {
  private readonly id: MessageId;
  private readonly role: Role;
  private readonly content: string;
  private readonly createdAt: Date;

  static create(role: Role, content: string): Message {
    Message.ensureMessageIsValid(role, content);
    return new Message(MessageId.create(), role, content, new Date());
  }

  static fromPrimitive(data: any): Message {
    if (!data) throw new Error('Message data must be provided');
    Message.ensureMessageIsValid(data.role, data.content);
    return new Message(
      MessageId.fromPrimitive(data.id),
      data.role as Role,
      data.content,
      new Date(data.createdAt),
    );
  }

  static ensureMessageIsValid(role: Role, content: string): void {
    if (!content || typeof content !== 'string' || content.trim() === '') {
      throw new Error('Message content cannot be empty');
    }
    if (!Object.values(Role).includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }
  }

  private constructor(id: MessageId, role: Role, content: string, createdAt: Date) {
    super();
    this.id = id;
    this.role = role;
    this.content = content;
    this.createdAt = createdAt;
  }

  getId(): MessageId {
    return this.id;
  }

  getRole(): Role {
    return this.role;
  }

  getContent(): string {
    return this.content;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  toPrimitive(): object {
    return {
      id: this.id.toPrimitive(),
      role: this.role,
      content: this.content,
      createdAt: this.createdAt,
    };
  }

  equals(other: ValueObject): boolean {
    if (!(other instanceof Message)) return false;
    return this.id.equals(other.id) && this.role === other.role && this.content === other.content;
  }
}
