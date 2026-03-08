import { Request, Response } from 'express'
import ConversationFactory from '../../modules/conversation/application/ConversationFactory'

export class StreamController {
  async sendMessage(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string
    const { message } = req.body

    if (!message) {
      res.status(400).json({ error: 'message is required' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    try {
      const stream = ConversationFactory.sendMessage(id, message)
      for await (const token of stream) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`)
      }
      res.write('data: [DONE]\n\n')
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
    } finally {
      res.end()
    }
  }
}
