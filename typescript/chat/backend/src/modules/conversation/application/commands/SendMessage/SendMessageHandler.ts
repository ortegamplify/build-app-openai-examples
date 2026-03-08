import { inject, injectable } from 'tsyringe';
import { ICommandHandler } from '../../../../../shared/application/ICommandHandler';
import { SendMessageCommand } from './SendMessageCommand';
import { ConversationRepository } from '../../../domain/ConversationRepository';
import { EventStore } from '../../../domain/EventStore';
import { IOpenAIPort } from '../../ports/IOpenAIPort';
import { TOKENS } from '../../../../../infrastructure/di/tokens';

@injectable()
export class SendMessageHandler
  implements ICommandHandler<SendMessageCommand, AsyncGenerator<string>>
{
  constructor(
    @inject(TOKENS.ConversationRepo)
    private readonly conversationRepository: ConversationRepository,
    @inject(TOKENS.EventStore)
    private readonly eventStore: EventStore,
    @inject(TOKENS.OpenAIPort)
    private readonly openaiPort: IOpenAIPort,
  ) {}

  async *execute(command: SendMessageCommand): AsyncGenerator<string> {
    const conversation = await this.conversationRepository.getConversation(command.conversationId);

    if (!conversation) {
      throw new Error(`[SendMessageHandler] Conversation not found: ${command.conversationId}`);
    }

    conversation.addUserMessage(command.message);
    const userEvents = conversation.pullDomainEvents();
    await this.eventStore.saveEvents(conversation.getId().getValue(), userEvents);

    const messages = conversation.getMessages().map((msg) => ({
      role: msg.getRole() as 'user' | 'assistant' | 'system',
      content: msg.getContent(),
    }));

    let fullResponse = '';
    for await (const chunk of this.openaiPort.streamCompletion(messages)) {
      fullResponse += chunk;
      yield chunk;
    }

    conversation.addAssistantMessage(fullResponse);
    const assistantEvents = conversation.pullDomainEvents();
    await this.eventStore.saveEvents(conversation.getId().getValue(), assistantEvents);
    await this.conversationRepository.updateConversation(conversation);
  }
}
