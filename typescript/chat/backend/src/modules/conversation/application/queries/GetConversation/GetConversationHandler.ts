import { inject, injectable } from 'tsyringe';
import { IQueryHandler } from '../../../../../shared/application/IQueryHandler';
import { GetConversationQuery } from './GetConversationQuery';
import { ConversationDTO } from './ConversationDTO';
import { ConversationRepository } from '../../../domain/ConversationRepository';
import { TOKENS } from '../../../../../infrastructure/di/tokens';

@injectable()
export class GetConversationHandler
  implements IQueryHandler<GetConversationQuery, ConversationDTO | null>
{
  constructor(
    @inject(TOKENS.ConversationRepo)
    private readonly conversationRepository: ConversationRepository,
  ) {}

  async execute(query: GetConversationQuery): Promise<ConversationDTO | null> {
    const conversation = await this.conversationRepository.getConversation(query.conversationId);
    if (!conversation) return null;

    return {
      id: conversation.getId().getValue(),
      title: conversation.getTitle(),
      messages: conversation.getMessages().map((msg) => ({
        id: msg.getId().getValue(),
        role: msg.getRole(),
        content: msg.getContent(),
        createdAt: msg.getCreatedAt(),
      })),
      createdAt: conversation.getCreatedAt(),
      updatedAt: conversation.getUpdatedAt(),
    };
  }
}
