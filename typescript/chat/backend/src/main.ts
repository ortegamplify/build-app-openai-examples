import 'reflect-metadata';
import dotenv from 'dotenv';
import { container } from 'tsyringe';
import { createApp } from './presentation/app';
import { connectToDatabase } from './infrastructure/persistence/mongoose/connection';
import {
  registerDependencies,
  registerCommandHandlers,
  registerQueryHandlers,
} from './infrastructure/di/container';
import { CommandBus } from './modules/conversation/application/bus/CommandBus';
import { QueryBus } from './modules/conversation/application/bus/QueryBus';

dotenv.config();

async function bootstrap(): Promise<void> {
  try {
    // Connect to database
    await connectToDatabase();

    // Register DI dependencies
    registerDependencies();

    // Register CQRS handlers
    const commandBus = container.resolve(CommandBus);
    const queryBus = container.resolve(QueryBus);

    registerCommandHandlers(commandBus);
    registerQueryHandlers(queryBus);

    // Create Express app
    const app = createApp();

    // Start server
    const port = process.env.PORT || 3001;
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to bootstrap application:', error);
    process.exit(1);
  }
}

bootstrap();
