import { Message } from '../domain/Message'
import { ConversationRepository } from '../domain/ConversationRepository'
import { OpenAIPort } from '../domain/OpenAIPort'

interface Props {
  conversationRepository: ConversationRepository
  openAI: OpenAIPort
  conversationId: string
  userMessage: string
}

export async function* sendMessage({
  conversationRepository,
  openAI,
  conversationId,
  userMessage,
}: Props): AsyncGenerator<string> {
  const conversation = await conversationRepository.findById(conversationId)
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`)
  }

  const userMsg = Message.create('user', userMessage)
  const conversationWithUser = conversation.addMessage(userMsg)
  await conversationRepository.save(conversationWithUser)

  const messages = conversationWithUser.getMessages().toOpenAIFormat()
  const stream = openAI.streamChat(messages)

  let fullResponse = ''
  for await (const token of stream) {
    fullResponse += token
    yield token
  }

  const assistantMsg = Message.create('assistant', fullResponse)
  const finalConversation = conversationWithUser.addMessage(assistantMsg)
  await conversationRepository.save(finalConversation)
}
