import { ICommand } from './ICommand';

export interface ICommandHandler<C extends ICommand, R = void> {
  execute(command: C): Promise<R>;
}
