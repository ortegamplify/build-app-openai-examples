import { container } from 'tsyringe';
import { CommandBus } from '../../modules/conversation/application/bus/CommandBus';
import { QueryBus } from '../../modules/conversation/application/bus/QueryBus';
import { EventBus } from '../../modules/conversation/application/bus/EventBus';
import { MongoConversationRepository } from '../../modules/conversation/infrastructure/persistence/mongoose/repositories/MongoConversationRepository';
import { MongoEventStore } from '../../modules/conversation/infrastructure/persistence/mongoose/repositories/MongoEventStore';
import { OpenAIAdapter } from '../../modules/conversation/infrastructure/openai/OpenAIAdapter';
import { CreateConversationHandler } from '../../modules/conversation/application/commands/CreateConversation/CreateConversationHandler';
import { SendMessageHandler } from '../../modules/conversation/application/commands/SendMessage/SendMessageHandler';
import { GetConversationHandler } from '../../modules/conversation/application/queries/GetConversation/GetConversationHandler';
import { GetAllConversationsHandler } from '../../modules/conversation/application/queries/GetAllConversations/GetAllConversationsHandler';
import { TOKENS } from './tokens';

export function registerDependencies(): void {
  container.register(CommandBus, { useClass: CommandBus });
  container.register(QueryBus, { useClass: QueryBus });
  container.register(EventBus, { useClass: EventBus });

  container.register(TOKENS.ConversationRepo, { useClass: MongoConversationRepository });
  container.register(TOKENS.EventStore, { useClass: MongoEventStore });
  container.register(TOKENS.OpenAIPort, { useClass: OpenAIAdapter });

  container.register(CreateConversationHandler, { useClass: CreateConversationHandler });
  container.register(SendMessageHandler, { useClass: SendMessageHandler });
  container.register(GetConversationHandler, { useClass: GetConversationHandler });
  container.register(GetAllConversationsHandler, { useClass: GetAllConversationsHandler });
}

export function registerCommandHandlers(commandBus: CommandBus): void {
  commandBus.register('CreateConversationCommand', container.resolve(CreateConversationHandler));
  commandBus.register('SendMessageCommand', container.resolve(SendMessageHandler));
}

export function registerQueryHandlers(queryBus: QueryBus): void {
  queryBus.register('GetConversationQuery', container.resolve(GetConversationHandler));
  queryBus.register('GetAllConversationsQuery', container.resolve(GetAllConversationsHandler));
}
