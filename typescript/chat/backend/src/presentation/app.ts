import express from 'express';
import cors from 'cors';
import { conversationRoutes } from './routes/conversations.routes';
import { streamRoutes } from './routes/stream.routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): express.Application {
  const app = express();

  // Middleware
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    }),
  );
  app.use(express.json());

  // Routes
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/stream', streamRoutes);

  // Error handling
  app.use(errorHandler);

  return app;
}
