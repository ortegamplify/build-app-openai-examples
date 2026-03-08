import { Router } from 'express';
import { container } from 'tsyringe';
import { ConversationController } from '../controllers/ConversationController';
import { CommandBus } from '../../modules/conversation/application/bus/CommandBus';
import { QueryBus } from '../../modules/conversation/application/bus/QueryBus';

export const conversationRoutes = Router();

const commandBus = container.resolve(CommandBus);
const queryBus = container.resolve(QueryBus);
const controller = new ConversationController(commandBus, queryBus);

conversationRoutes.post('/', (req, res) => controller.create(req, res));
conversationRoutes.get('/', (req, res) => controller.getAll(req, res));
conversationRoutes.get('/:id', (req, res) => controller.getById(req, res));
