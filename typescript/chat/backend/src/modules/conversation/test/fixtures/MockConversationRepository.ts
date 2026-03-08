import { ConversationRepository } from '../../domain/ConversationRepository';
import { ConversationList } from '../../domain/ConversationList';
import { Conversation } from '../../domain/Conversation';

export class MockConversationRepository implements ConversationRepository {
  private store: Map<string, Conversation> = new Map();

  async createConversation(conversation: Conversation): Promise<Conversation> {
    this.store.set(conversation.getId().getValue(), conversation);
    return conversation;
  }

  async updateConversation(conversation: Conversation): Promise<boolean> {
    const id = conversation.getId().getValue();
    if (!this.store.has(id)) return false;
    this.store.set(id, conversation);
    return true;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.store.get(id) ?? null;
  }

  async getConversations(): Promise<ConversationList> {
    return ConversationList.create([...this.store.values()]);
  }

  async deleteConversation(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  // Test helpers
  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
