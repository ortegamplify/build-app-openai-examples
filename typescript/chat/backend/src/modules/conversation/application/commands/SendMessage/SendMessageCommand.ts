import { ICommand } from '../../../../../shared/application/ICommand';

export class SendMessageCommand implements ICommand {
  readonly name = 'SendMessageCommand';

  constructor(
    readonly conversationId: string,
    readonly message: string,
  ) {}
}
