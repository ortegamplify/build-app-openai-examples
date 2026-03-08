import { Request, Response } from 'express';
import { CommandBus } from '../../modules/conversation/application/bus/CommandBus';
import { QueryBus } from '../../modules/conversation/application/bus/QueryBus';
import { CreateConversationCommand } from '../../modules/conversation/application/commands/CreateConversation/CreateConversationCommand';
import { GetConversationQuery } from '../../modules/conversation/application/queries/GetConversation/GetConversationQuery';
import { GetAllConversationsQuery } from '../../modules/conversation/application/queries/GetAllConversations/GetAllConversationsQuery';

export class ConversationController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async create(req: Request, res: Response): Promise<void> {
    try {
      const { title } = req.body;
      const command = new CreateConversationCommand(title || 'New Conversation');
      const conversationId = await this.commandBus.dispatch(command);

      res.status(201).json({ id: conversationId });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const query = new GetConversationQuery(id);
      const conversation = await this.queryBus.dispatch(query);

      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      res.json(conversation);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  }

  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const query = new GetAllConversationsQuery();
      const conversations = await this.queryBus.dispatch(query);
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  }
}
