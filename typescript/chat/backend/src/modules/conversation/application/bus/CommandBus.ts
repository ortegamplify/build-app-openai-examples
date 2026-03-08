import { injectable } from 'tsyringe';
import { ICommand } from '../../../../shared/application/ICommand';
import { ICommandHandler } from '../../../../shared/application/ICommandHandler';

@injectable()
export class CommandBus {
  private handlers: Map<string, ICommandHandler<any, any>> = new Map();

  register<C extends ICommand, R>(
    commandName: string,
    handler: ICommandHandler<C, R>,
  ): void {
    this.handlers.set(commandName, handler);
  }

  async dispatch<C extends ICommand, R>(command: C): Promise<R> {
    const commandName = command.constructor.name;
    const handler = this.handlers.get(commandName);

    if (!handler) {
      throw new Error(`No handler registered for command: ${commandName}`);
    }

    return handler.execute(command);
  }
}
