import { Conversation } from './Conversation';

export class ConversationList {
  private readonly conversations: Conversation[];

  static create(conversations: Conversation[] | null): ConversationList {
    return new ConversationList(conversations ?? []);
  }

  static fromPrimitive(data: any[] | null): ConversationList {
    if (!data) return ConversationList.create(null);
    return ConversationList.create(data.map((d) => Conversation.fromPrimitive(d)));
  }

  private constructor(conversations: Conversation[]) {
    this.conversations = conversations;
  }

  getConversations(): Conversation[] {
    return [...this.conversations];
  }

  getConversationById(id: string): Conversation | null {
    return this.conversations.find((c) => c.getId().getValue() === id) ?? null;
  }

  addConversation(conversation: Conversation): ConversationList {
    return ConversationList.create([...this.conversations, conversation]);
  }

  removeConversation(id: string): ConversationList {
    return ConversationList.create(this.conversations.filter((c) => c.getId().getValue() !== id));
  }

  isEmpty(): boolean {
    return this.conversations.length === 0;
  }

  count(): number {
    return this.conversations.length;
  }

  toPrimitive(): object[] {
    return this.conversations.map((c) => c.toPrimitive());
  }

  equals(other: ConversationList): boolean {
    if (this.conversations.length !== other.conversations.length) return false;
    return this.conversations.every((c, i) => c.equals(other.conversations[i]));
  }
}
