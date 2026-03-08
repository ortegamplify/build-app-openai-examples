import { AggregateRoot } from '../../../shared/domain/AggregateRoot';
import { ConversationId } from './ConversationId';
import { Message } from './Message';
import { Role } from './Role';
import { ConversationCreated } from './events/ConversationCreated';
import { MessageAdded } from './events/MessageAdded';
import { AssistantReplied } from './events/AssistantReplied';

export class Conversation extends AggregateRoot {
  private messages: Message[];
  private title: string;
  private readonly createdAt: Date;
  private updatedAt: Date;

  static create(title: string = 'New Conversation'): Conversation {
    Conversation.ensureConversationIsValid(title);
    const id = ConversationId.create();
    const conversation = new Conversation(id, [], title, new Date(), new Date());
    conversation.addDomainEvent(new ConversationCreated(id.getValue(), new Date(), title));
    return conversation;
  }

  static fromPrimitive(data: any): Conversation {
    if (!data) throw new Error('Conversation data must be provided');
    Conversation.ensureConversationIsValid(data.title);
    const messages = (data.messages || []).map((m: any) => Message.fromPrimitive(m));
    return new Conversation(
      ConversationId.fromPrimitive(data.id),
      messages,
      data.title,
      new Date(data.createdAt),
      new Date(data.updatedAt),
    );
  }

  static ensureConversationIsValid(title: string): void {
    if (!title || typeof title !== 'string' || title.trim() === '') {
      throw new Error('Conversation title must be a non-empty string');
    }
  }

  private constructor(
    private readonly id: ConversationId,
    messages: Message[],
    title: string,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super();
    this.messages = messages;
    this.title = title;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  getId(): ConversationId {
    return this.id;
  }

  getTitle(): string {
    return this.title;
  }

  withTitle(title: string): Conversation {
    Conversation.ensureConversationIsValid(title);
    return new Conversation(this.id, [...this.messages], title, this.createdAt, new Date());
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  addUserMessage(content: string): void {
    const message = Message.create(Role.USER, content);
    this.messages.push(message);
    this.updatedAt = new Date();
    this.addDomainEvent(
      new MessageAdded(this.id.getValue(), message.getId().getValue(), Role.USER, content),
    );
  }

  addAssistantMessage(content: string): void {
    const message = Message.create(Role.ASSISTANT, content);
    this.messages.push(message);
    this.updatedAt = new Date();
    this.addDomainEvent(
      new AssistantReplied(this.id.getValue(), message.getId().getValue(), content),
    );
  }

  toPrimitive(): object {
    return {
      id: this.id.toPrimitive(),
      title: this.title,
      messages: this.messages.map((m) => m.toPrimitive()),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  equals(other: Conversation): boolean {
    return this.id.equals(other.id);
  }
}
