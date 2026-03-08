import { Conversation } from '../domain/Conversation'
import { ConversationRepository } from '../domain/ConversationRepository'

interface Props {
  conversationRepository: ConversationRepository
  id: string
}

export async function getConversation({ conversationRepository, id }: Props): Promise<Conversation> {
  const conversation = await conversationRepository.findById(id)
  if (!conversation) {
    throw new Error(`Conversation ${id} not found`)
  }
  return conversation
}
