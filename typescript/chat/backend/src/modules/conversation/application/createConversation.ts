import { Conversation } from '../domain/Conversation'
import { ConversationRepository } from '../domain/ConversationRepository'
import { MessageList } from '../domain/MessageList'

interface Props {
  conversationRepository: ConversationRepository
}

export async function createConversation({ conversationRepository }: Props): Promise<Conversation> {
  const conversation = Conversation.create(null, MessageList.create())
  return conversationRepository.save(conversation)
}
