import { Request, Response } from 'express';
import { CommandBus } from '../../modules/conversation/application/bus/CommandBus';
import { SendMessageCommand } from '../../modules/conversation/application/commands/SendMessage/SendMessageCommand';

export class StreamController {
  constructor(private readonly commandBus: CommandBus) {}

  async stream(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId, message } = req.body;

      if (!conversationId || !message) {
        res
          .status(400)
          .json({ error: 'conversationId and message are required' });
        return;
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const command = new SendMessageCommand(conversationId, message);
      const generator = (await this.commandBus.dispatch(command)) as AsyncGenerator<
        string,
        void,
        unknown
      >;

      for await (const chunk of generator) {
        res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
      }

      res.write('event: done\ndata: {}\n\n');
      res.end();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: String(error) })}\n\n`);
      res.end();
    }
  }
}
