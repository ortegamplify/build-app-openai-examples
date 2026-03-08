import { Router } from 'express'
import { ConversationController } from '../controllers/ConversationController'

const router = Router()
const controller = new ConversationController()

router.post('/', (req, res) => controller.create(req, res))
router.get('/', (req, res) => controller.findAll(req, res))
router.get('/:id', (req, res) => controller.findById(req, res))

export default router
