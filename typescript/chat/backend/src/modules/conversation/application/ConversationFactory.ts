import { MongoConversationRepository } from '../infrastructure/MongoConversationRepository'
import { OpenAIStreamAdapter } from '../infrastructure/OpenAIStreamAdapter'
import { createConversation } from './createConversation'
import { sendMessage } from './sendMessage'
import { getConversation } from './getConversation'
import { getConversations } from './getConversations'

const ConversationFactory = {
  createConversation: () =>
    createConversation({ conversationRepository: new MongoConversationRepository() }),

  sendMessage: (conversationId: string, userMessage: string) =>
    sendMessage({
      conversationId,
      userMessage,
      conversationRepository: new MongoConversationRepository(),
      openAI: new OpenAIStreamAdapter(),
    }),

  getConversation: (id: string) =>
    getConversation({ id, conversationRepository: new MongoConversationRepository() }),

  getConversations: () =>
    getConversations({ conversationRepository: new MongoConversationRepository() }),
}

export default ConversationFactory
