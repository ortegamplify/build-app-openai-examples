import { Conversation } from '../domain/Conversation'
import { ConversationRepository } from '../domain/ConversationRepository'

interface Props {
  conversationRepository: ConversationRepository
}

export async function getConversations({ conversationRepository }: Props): Promise<Conversation[]> {
  return conversationRepository.findAll()
}
