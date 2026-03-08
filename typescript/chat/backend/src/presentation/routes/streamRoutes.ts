import { Router } from 'express'
import { StreamController } from '../controllers/StreamController'

const router = Router()
const controller = new StreamController()

router.post('/:id/messages', (req, res) => controller.sendMessage(req, res))

export default router
