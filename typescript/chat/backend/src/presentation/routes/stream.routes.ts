import { Router } from 'express';
import { container } from 'tsyringe';
import { StreamController } from '../controllers/StreamController';
import { CommandBus } from '../../modules/conversation/application/bus/CommandBus';

export const streamRoutes = Router();

const commandBus = container.resolve(CommandBus);
const controller = new StreamController(commandBus);

streamRoutes.post('/', (req, res) => controller.stream(req, res));
