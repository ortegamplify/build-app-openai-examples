import { ICommand } from '../../../../../shared/application/ICommand';

export class CreateConversationCommand implements ICommand {
  readonly name = 'CreateConversationCommand';

  constructor(readonly title: string = 'New Conversation') {}
}
