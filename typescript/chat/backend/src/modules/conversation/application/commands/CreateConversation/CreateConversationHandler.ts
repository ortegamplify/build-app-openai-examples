import { inject, injectable } from 'tsyringe';
import { ICommandHandler } from '../../../../../shared/application/ICommandHandler';
import { CreateConversationCommand } from './CreateConversationCommand';
import { Conversation } from '../../../domain/Conversation';
import { ConversationRepository } from '../../../domain/ConversationRepository';
import { EventStore } from '../../../domain/EventStore';
import { TOKENS } from '../../../../../infrastructure/di/tokens';

@injectable()
export class CreateConversationHandler
  implements ICommandHandler<CreateConversationCommand, string>
{
  constructor(
    @inject(TOKENS.ConversationRepo)
    private readonly conversationRepository: ConversationRepository,
    @inject(TOKENS.EventStore)
    private readonly eventStore: EventStore,
  ) {}

  async execute(command: CreateConversationCommand): Promise<string> {
    const conversation = Conversation.create(command.title);

    const events = conversation.pullDomainEvents();
    await this.eventStore.saveEvents(conversation.getId().getValue(), events);
    await this.conversationRepository.createConversation(conversation);

    return conversation.getId().getValue();
  }
}
