import { Conversation } from './Conversation'

export interface ConversationRepository {
  save(conversation: Conversation): Promise<Conversation>
  findById(id: string): Promise<Conversation | null>
  findAll(): Promise<Conversation[]>
  delete(id: string): Promise<boolean>
}
