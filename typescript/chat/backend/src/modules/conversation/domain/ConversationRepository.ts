import { Conversation } from './Conversation';
import { ConversationList } from './ConversationList';

export interface ConversationRepository {
  createConversation(conversation: Conversation): Promise<Conversation>;
  updateConversation(conversation: Conversation): Promise<boolean>;
  getConversation(id: string): Promise<Conversation | null>;
  getConversations(): Promise<ConversationList>;
  deleteConversation(id: string): Promise<boolean>;
}
