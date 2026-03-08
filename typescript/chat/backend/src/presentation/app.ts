import express from 'express'
import cors from 'cors'
import conversationRoutes from './routes/conversationRoutes'
import streamRoutes from './routes/streamRoutes'

const app = express()

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' }))
app.use(express.json())

app.use('/api/conversations', conversationRoutes)
app.use('/api/conversations', streamRoutes)

export default app
