import { inject, injectable } from 'tsyringe';
import { IQueryHandler } from '../../../../../shared/application/IQueryHandler';
import { GetAllConversationsQuery } from './GetAllConversationsQuery';
import { ConversationDTO } from '../GetConversation/ConversationDTO';
import { ConversationRepository } from '../../../domain/ConversationRepository';
import { TOKENS } from '../../../../../infrastructure/di/tokens';

@injectable()
export class GetAllConversationsHandler
  implements IQueryHandler<GetAllConversationsQuery, ConversationDTO[]>
{
  constructor(
    @inject(TOKENS.ConversationRepo)
    private readonly conversationRepository: ConversationRepository,
  ) {}

  async execute(): Promise<ConversationDTO[]> {
    const list = await this.conversationRepository.getConversations();
    return list.getConversations().map((conv) => ({
      id: conv.getId().getValue(),
      title: conv.getTitle(),
      messages: conv.getMessages().map((msg) => ({
        id: msg.getId().getValue(),
        role: msg.getRole(),
        content: msg.getContent(),
        createdAt: msg.getCreatedAt(),
      })),
      createdAt: conv.getCreatedAt(),
      updatedAt: conv.getUpdatedAt(),
    }));
  }
}
