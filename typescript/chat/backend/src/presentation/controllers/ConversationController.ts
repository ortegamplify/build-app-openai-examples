import { Request, Response } from 'express'
import ConversationFactory from '../../modules/conversation/application/ConversationFactory'

export class ConversationController {
  async create(req: Request, res: Response): Promise<void> {
    try {
      const conversation = await ConversationFactory.createConversation()
      res.status(201).json(conversation.toPrimitive())
    } catch (error) {
      res.status(500).json({ error: 'Failed to create conversation' })
    }
  }

  async findAll(req: Request, res: Response): Promise<void> {
    try {
      const conversations = await ConversationFactory.getConversations()
      res.json(conversations.map((c) => c.toPrimitive()))
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch conversations' })
    }
  }

  async findById(req: Request, res: Response): Promise<void> {
    try {
      const conversation = await ConversationFactory.getConversation(req.params.id as string)
      res.json(conversation.toPrimitive())
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        res.status(404).json({ error: error.message })
      } else {
        res.status(500).json({ error: 'Failed to fetch conversation' })
      }
    }
  }
}
